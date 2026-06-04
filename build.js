const fs = require('fs');

const token  = process.env.BOT_TOKEN     || '';
const chatId = process.env.OWNER_CHAT_ID || '';

fs.writeFileSync(
  'tg-app/js/config.js',
  `const CONFIG = { BOT_TOKEN: "${token}", OWNER_CHAT_ID: "${chatId}" };\n`
);

console.log('config.js generated (BOT_TOKEN ' + (token ? 'set' : 'EMPTY') + ')');
