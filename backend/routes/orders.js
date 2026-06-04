const express        = require('express');
const router         = express.Router();
const pool           = require('../services/db');
const verifyInitData = require('../middleware/verifyInitData');
const { createInvoiceLink } = require('../services/telegram');

router.post('/', async (req, res) => {
  try {
    const { initData, recipient_name, items, total_rub } = req.body;

    const user = verifyInitData(initData);
    if (!user) return res.status(403).json({ error: 'Invalid initData' });

    const calculated = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    if (calculated !== total_rub) return res.status(400).json({ error: 'Total mismatch' });

    const order_no = '#' + String(Date.now()).slice(-4).padStart(4, '0');

    await pool.query(
      `INSERT INTO orders
         (order_no, tg_user_id, tg_username, tg_fullname, recipient_name, items, total_rub)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        order_no,
        user.id,
        user.username || null,
        [user.first_name, user.last_name].filter(Boolean).join(' '),
        recipient_name,
        JSON.stringify(items),
        total_rub,
      ]
    );

    const invoice_link = await createInvoiceLink(order_no, items, total_rub);
    res.json({ order_no, invoice_link });
  } catch (err) {
    console.error('POST /api/orders error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
