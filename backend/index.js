require('dotenv').config();
require('dns').setDefaultResultOrder('ipv4first');
const express = require('express');
const app = express();

app.use(express.json());

app.use('/api/orders',  require('./routes/orders'));
app.use('/api/webhook', require('./routes/webhook'));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Pro-Marker backend on port ${PORT}`));
