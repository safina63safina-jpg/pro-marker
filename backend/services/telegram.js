const https = require('https');

function call(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      res => {
        let raw = '';
        res.on('data', c => (raw += c));
        res.on('end', () => resolve(JSON.parse(raw)));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function createInvoiceLink(order_no, items, total_rub) {
  const prices = items.map(i => ({
    label: `${i.name} × ${i.qty}`,
    amount: i.price * i.qty * 100,
  }));

  const result = await call('createInvoiceLink', {
    title: `Заказ ${order_no}`,
    description: items.map(i => `${i.name} × ${i.qty}`).join(', '),
    payload: order_no,
    provider_token: process.env.TELEGRAM_PAYMENT_PROVIDER_TOKEN,
    currency: 'RUB',
    prices,
  });

  if (!result.ok) throw new Error(result.description);
  return result.result;
}

async function notifyManager(order) {
  const itemsText = order.items
    .map(i => `  • ${i.name} × ${i.qty} = ${(i.price * i.qty).toLocaleString('ru')} ₽`)
    .join('\n');

  const contactLine = order.tg_username
    ? `@${order.tg_username}`
    : `ID: ${order.tg_user_id}`;

  const text =
    `🛒 Новый оплаченный заказ ${order.order_no}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `${itemsText}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💰 Итого: ${order.total_rub.toLocaleString('ru')} ₽  💳 Оплачено ✓\n\n` +
    `👤 ${order.tg_fullname}\n` +
    `📱 ${contactLine}`;

  await call('sendMessage', {
    chat_id: process.env.OWNER_CHAT_ID,
    text,
    reply_markup: {
      inline_keyboard: [
        [{ text: '📩 Написать покупателю', url: `tg://user?id=${order.tg_user_id}` }],
        [{ text: '✅ Принял в работу',     callback_data: `contacted:${order.order_no}` }],
      ],
    },
  });
}

module.exports = { call, createInvoiceLink, notifyManager };
