// setup-bot.js — настройка бота через Telegram Bot API
// Запуск: node setup-bot.js

const https = require('https');

const TOKEN = '8809380836:AAFOH8NpqGYgIpcdPD2Ks-OPKejVLGh71K4';
const BASE  = `https://api.telegram.org/bot${TOKEN}`;

function call(method, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(`${BASE}/${method}`, opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        const r = JSON.parse(raw);
        console.log(`${method}: ${r.ok ? 'OK' : 'FAIL — ' + r.description}`);
        resolve(r);
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  await call('setMyDescription', {
    description:
      'Маркеры и стикеры-закладки для красивых записей — прямо в Telegram. ' +
      'Постоянные и сезонные коллекции, программа лояльности с подарком. ' +
      'Нажми кнопку «Магазин» ниже, чтобы начать!',
    language_code: 'ru',
  });

  await call('setMyShortDescription', {
    short_description: 'Маркеры и стикеры-закладки для красивых записей',
    language_code: 'ru',
  });

  await call('setMyCommands', {
    commands: [
      { command: 'start', description: 'Открыть магазин' },
      { command: 'help',  description: 'Помощь и информация' },
    ],
    language_code: 'ru',
  });

  await call('setChatMenuButton', {
    menu_button: {
      type:    'web_app',
      text:    'Магазин',
      web_app: { url: 'https://tg-app-flame.vercel.app' },
    },
  });
}

main().catch(console.error);
