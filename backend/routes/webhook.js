const express = require('express');
const router  = express.Router();
const pool    = require('../services/db');
const { call, notifyManager } = require('../services/telegram');

router.post('/telegram', async (req, res) => {
  res.sendStatus(200);

  const update = req.body;

  try {
    // 1. Подтверждение перед оплатой
    if (update.pre_checkout_query) {
      const pq = update.pre_checkout_query;
      const { rows } = await pool.query(
        'SELECT * FROM orders WHERE order_no = $1', [pq.invoice_payload]
      );
      const order = rows[0];
      const valid = order && order.status === 'pending' && order.total_rub * 100 === pq.total_amount;

      await call('answerPreCheckoutQuery', {
        pre_checkout_query_id: pq.id,
        ok: valid,
        ...(!valid && { error_message: 'Заказ недоступен' }),
      });
      return;
    }

    // 2. Успешная оплата
    if (update.message?.successful_payment) {
      const payment  = update.message.successful_payment;
      const order_no = payment.invoice_payload;

      const { rows } = await pool.query(
        `UPDATE orders SET status='paid', payment_id=$1, paid_at=NOW()
         WHERE order_no=$2 RETURNING *`,
        [payment.telegram_payment_charge_id, order_no]
      );

      if (rows[0]) await notifyManager(rows[0]);
      return;
    }

    // 3. Команды менеджера (только от OWNER_CHAT_ID)
    const msg = update.message;
    if (msg?.text && String(msg.chat.id) === String(process.env.OWNER_CHAT_ID)) {
      const text   = msg.text.trim();
      const chatId = msg.chat.id;

      if (text === '/orders' || text === '/orders paid') {
        const where  = text === '/orders paid' ? `WHERE status='paid'` : '';
        const { rows } = await pool.query(
          `SELECT order_no, status, tg_fullname, total_rub, created_at
           FROM orders ${where} ORDER BY created_at DESC LIMIT 10`
        );
        if (!rows.length) {
          await call('sendMessage', { chat_id: chatId, text: 'Заказов нет' });
          return;
        }
        const lines = rows.map(r =>
          `${r.order_no} | ${r.status} | ${r.tg_fullname} | ${r.total_rub} ₽`
        ).join('\n');
        await call('sendMessage', { chat_id: chatId, text: `📋 Заказы:\n\n${lines}` });
        return;
      }

      if (text.startsWith('/order ')) {
        const order_no   = text.split(' ')[1];
        const { rows } = await pool.query('SELECT * FROM orders WHERE order_no=$1', [order_no]);
        if (!rows[0]) {
          await call('sendMessage', { chat_id: chatId, text: `${order_no} не найден` });
          return;
        }
        const o = rows[0];
        const lines = o.items.map(i => `  • ${i.name} × ${i.qty} = ${i.price * i.qty} ₽`).join('\n');
        await call('sendMessage', {
          chat_id: chatId,
          text: `📦 ${o.order_no} | ${o.status}\n👤 ${o.tg_fullname}\n\n${lines}\n\nИтого: ${o.total_rub} ₽`,
          reply_markup: {
            inline_keyboard: [[{ text: '📩 Написать', url: `tg://user?id=${o.tg_user_id}` }]],
          },
        });
        return;
      }

      if (text.startsWith('/status ')) {
        const [, order_no, newStatus] = text.split(' ');
        const valid = ['pending','paid','contacted','shipped','done'].includes(newStatus);
        if (!valid) {
          await call('sendMessage', { chat_id: chatId, text: 'Статусы: pending, paid, contacted, shipped, done' });
          return;
        }
        const { rows } = await pool.query(
          `UPDATE orders SET status=$1 WHERE order_no=$2 RETURNING order_no`, [newStatus, order_no]
        );
        const reply = rows[0] ? `✅ ${order_no} → ${newStatus}` : `${order_no} не найден`;
        await call('sendMessage', { chat_id: chatId, text: reply });
        return;
      }
    }

    // 4. Кнопка «Принял в работу»
    if (update.callback_query?.data?.startsWith('contacted:')) {
      const cq       = update.callback_query;
      const order_no = cq.data.split(':')[1];
      await pool.query(`UPDATE orders SET status='contacted' WHERE order_no=$1`, [order_no]);
      await call('answerCallbackQuery', { callback_query_id: cq.id, text: `${order_no} → contacted` });
    }
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
});

module.exports = router;
