# BACKEND-PLAN.md — Бэкенд для Pro-Marker

## Цель

Покупатель оплачивает заказ прямо в Telegram. Менеджер получает уведомление с данными: кто, что и сколько купил, с кнопкой «Написать покупателю». Далее — ручная связь для уточнения доставки.

Всё остальное (аналитика, история заказов, личный кабинет, вишлисты) — вне этого плана.

---

## Что изменится в текущей логике

Сейчас `App._submit()` в `app.js`:
1. Собирает имя, адрес, телефон, корзину
2. Отправляет текст через `sendMessage` боту
3. Показывает экран успеха

**После:**
1. Собирает имя + корзину (адрес и телефон — менеджер уточнит в чате, не нужны в форме)
2. Отправляет `POST /api/orders` на сервер → получает invoice_link
3. Вызывает `Telegram.WebApp.openInvoice(link, callback)` — нативный платёж
4. После оплаты показывает экран успеха

Форма сокращается до одного поля «Имя получателя» (предзаполнено из Telegram).

---

## База данных

Одна таблица. Всё остальное — избыточно для текущего масштаба.

```sql
CREATE TABLE orders (
  id           SERIAL PRIMARY KEY,
  order_no     TEXT NOT NULL UNIQUE,      -- "#4721", генерируется на сервере

  -- Telegram-идентификаторы покупателя
  tg_user_id   BIGINT NOT NULL,           -- из initData (верифицируется на сервере)
  tg_username  TEXT,                      -- @handle или NULL (у части пользователей нет)
  tg_fullname  TEXT NOT NULL,             -- first_name + last_name

  -- Контактное имя из формы
  recipient_name TEXT NOT NULL,           -- поле "Имя получателя"

  -- Состав заказа
  items        JSONB NOT NULL,
  -- формат: [{ "id": "h-r-1", "name": "Пастельный рассвет",
  --            "qty": 2, "price": 690, "catLabel": "Текстовыделители" }]
  total_rub    INTEGER NOT NULL,          -- итог в рублях

  -- Оплата
  payment_id   TEXT,                      -- ID транзакции от Telegram Payments
  paid_at      TIMESTAMPTZ,

  -- Статус
  status       TEXT NOT NULL DEFAULT 'pending',
  -- pending   — заказ создан, ожидает оплаты
  -- paid      — оплачен, менеджер должен связаться
  -- contacted — менеджер написал покупателю
  -- shipped   — отправлено
  -- done      — завершён

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для запросов менеджера
CREATE INDEX idx_orders_status     ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_tg_user_id ON orders(tg_user_id);
```

### Почему одна таблица, а не нормализованная

Товарный каталог статичен (hardcoded в `catalog.js`), меняется редко. Хранить `order_items` отдельно нет смысла — нет ни отчётов по товарам, ни инвентаря. JSONB в `items` достаточно.

---

## API — 4 эндпоинта

### POST /api/orders

Создаёт заказ, возвращает invoice_link для `openInvoice`.

**Запрос (из app.js):**
```json
{
  "initData": "...",              // Telegram.WebApp.initData — строка для верификации
  "recipient_name": "Анна",
  "items": [
    { "id": "h-r-1", "name": "Пастельный рассвет", "qty": 2, "price": 690, "catLabel": "Текстовыделители" }
  ],
  "total_rub": 1380
}
```

**Сервер:**
1. Верифицирует `initData` через HMAC-SHA256 с `BOT_TOKEN` (обязательно — иначе любой может создать заказ)
2. Извлекает `tg_user_id`, `tg_username`, `tg_fullname` из `initData`
3. Проверяет, что `total_rub` совпадает с суммой `items` (защита от подмены цены)
4. Создаёт запись в `orders` (status: `pending`)
5. Вызывает Bot API `createInvoiceLink` с параметрами платежа
6. Возвращает `invoice_link`

**Ответ:**
```json
{ "order_no": "#4721", "invoice_link": "https://t.me/$invoice..." }
```

---

### POST /api/webhook/telegram

Единственный webhook для бота — принимает все апдейты от Telegram.

Обрабатывает три типа:

**`pre_checkout_query`** — Telegram спрашивает: «Принять платёж?»
- Находит заказ по `payload` (order_no)
- Проверяет, что он всё ещё `pending` и сумма совпадает
- Отвечает `answerPreCheckoutQuery(ok: true)`

**`message.successful_payment`** — оплата прошла
- Находит заказ по `payload`
- Обновляет: `status = 'paid'`, `payment_id`, `paid_at`
- Отправляет менеджеру уведомление (см. ниже)
- Опционально: отправляет покупателю подтверждение

**`message.text` с командами** — интерфейс менеджера
- `/orders` → список последних 10 заказов
- `/order #4721` → полные данные заказа
- `/status #4721 shipped` → обновить статус

---

### POST /api/webhook/payment  (резервный)

Webhook от платёжного провайдера (YooKassa). На случай если `successful_payment` от Telegram потеряется или при использовании провайдера напрямую.

- Верифицирует подпись провайдера
- Обновляет статус заказа по `payment_id`

---

### GET /api/health

Проверка работоспособности сервера. Возвращает `{ "ok": true }`. Нужен для мониторинга Railway/Render.

---

## Платёжный флоу — шаг за шагом

```
Покупатель (Mini App)                  Сервер                   Telegram
─────────────────────────────────────────────────────────────────────────

1. Нажал «Оплатить» в оформлении
   │
   ├─ POST /api/orders ──────────────→ Верифицирует initData
   │                                   Создаёт orders (pending)
   │                                   Вызывает createInvoiceLink
   │  ← { invoice_link } ─────────────┘
   │
2. openInvoice(invoice_link, cb)
   │                                                      ↓
   │                                            Показывает нативный
   │                                            платёжный экран
   │
3. Пользователь платит
   │                                                      ↓
   │                                   ← pre_checkout_query ────────────
   │                                   → answerPreCheckoutQuery(ok) ───→
   │                                                      ↓
   │                                   ← successful_payment ────────────
   │                                   Обновляет orders (paid)
   │                                   Уведомляет менеджера
   │
4. callback('paid')
   │
5. Показывает screen-success
```

---

## Уведомление менеджеру

Когда заказ оплачен, бот отправляет менеджеру (`OWNER_CHAT_ID`) сообщение:

```
🛒 Новый оплаченный заказ #4721
━━━━━━━━━━━━━━━━━━
  • Пастельный рассвет × 2 = 1 380 ₽
  • Акварельный сад × 1 = 470 ₽
━━━━━━━━━━━━━━━━━━
💰 Итого: 1 850 ₽  💳 Оплачено ✓

👤 Анна Иванова
📱 @username
```

Под сообщением — inline-кнопки:
- **[📩 Написать покупателю]** — `tg://user?id=123456789` (открывает чат)
- **[✅ Принял в работу]** — callback, обновляет статус на `contacted`

> Если у покупателя нет `@username`, кнопка «Написать» использует `tg://user?id=...` — работает в Telegram Desktop и iOS, в Android зависит от версии. Запасной вариант: менеджер ищет по `tg_user_id` через пересланное сообщение боту от пользователя.

---

## Интерфейс менеджера (через бота)

Никаких отдельных веб-панелей. Всё управление — командами боту.

| Команда | Что делает |
|---------|-----------|
| `/orders` | Последние 10 заказов: статус, имя, сумма, дата |
| `/orders paid` | Только оплаченные, не обработанные |
| `/order #4721` | Полные данные: покупатель, состав, статус, `[Написать]` |
| `/status #4721 contacted` | Сменить статус |
| `/status #4721 shipped` | Отметить отправленным (опционально бот напишет покупателю) |

Добавлять эти команды в `setMyCommands` **не нужно** — они не должны быть видны покупателям. Бот просто обрабатывает их только от `OWNER_CHAT_ID`.

---

## Верификация initData — почему обязательно

Telegram передаёт данные пользователя в `initData` — строку с HMAC-подписью. Без проверки подписи на сервере любой может отправить фейковый `tg_user_id` и создать заказ от имени другого пользователя.

Алгоритм проверки (Node.js):
```js
const crypto = require('crypto');

function verifyInitData(initDataRaw, botToken) {
  const params  = new URLSearchParams(initDataRaw);
  const hash    = params.get('hash');
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  return expectedHash === hash;
}
```

---

## Стек

| Компонент | Выбор | Причина |
|-----------|-------|---------|
| **Сервер** | Node.js/Express на [Railway](https://railway.app) | Простой деплой из git, бесплатный tier, персистентный процесс для webhook |
| **База данных** | PostgreSQL (встроен в Railway) | Не нужна отдельная регистрация, SQL, бесплатно до 1 GB |
| **Платёжный провайдер** | [ЮKassa](https://yookassa.ru) через Telegram Payments | Работает в России, официальный провайдер Telegram, не надо уходить из Telegram |
| **Бот-библиотека** | [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) | Уже используется концептуально, простая |
| **Фронтенд** | Без изменений — Vercel | Только меняем `_submit()` в app.js |

Альтернатива базе данных: **Supabase** (отдельный сервис, зато есть веб-интерфейс для просмотра таблиц). Если важно видеть данные через браузер без bot-команд — взять Supabase вместо Railway PostgreSQL.

---

## Переменные окружения

На сервере (Railway):
```env
BOT_TOKEN=8809380836:AAFOH8NpqGYgIpcdPD2Ks-OPKejVLGh71K4
OWNER_CHAT_ID=<твой telegram chat_id>
DATABASE_URL=postgresql://...        # Railway даёт автоматически
TELEGRAM_WEBHOOK_SECRET=<случайная строка>  # защита webhook от чужих запросов
YOOKASSA_SHOP_ID=<из личного кабинета ЮKassa>
YOOKASSA_SECRET_KEY=<из личного кабинета ЮKassa>
```

На Vercel (фронтенд) — только:
```env
VITE_API_URL=https://pro-marker-api.railway.app
```

(Текущие `BOT_TOKEN` и `OWNER_CHAT_ID` переехали на сервер — из `config.js` фронтенда их нужно убрать.)

---

## Что менять в app.js

Текущий `App._submit()` — заменить полностью.

**Было:**
```js
// Отправляет текстовое сообщение боту + показывает успех
fetch(`https://api.telegram.org/bot${token}/sendMessage`, { ... });
this.navigate('success');
```

**Станет:**
```js
async _submit() {
  const phone = document.getElementById('input-phone').value.trim();
  // валидация телефона — убрать (менеджер уточнит в чате)

  const name = document.getElementById('input-name').value.trim();
  if (!name) { /* ошибка */ return; }

  // 1. Создать заказ на сервере
  const res = await fetch('https://pro-marker-api.railway.app/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      initData:        tg.initData,        // строка, не объект
      recipient_name:  name,
      items:           Cart.items,
      total_rub:       Cart.total,
    }),
  });
  const { order_no, invoice_link } = await res.json();
  this._pendingOrderNo = order_no;

  // 2. Открыть нативный платёжный экран Telegram
  tg.openInvoice(invoice_link, (status) => {
    if (status === 'paid') {
      this._addGiftProgress(Cart.items.reduce((s, i) => s + i.qty, 0));
      this.navigate('success');
    } else if (status === 'cancelled') {
      toast('Оплата отменена');
    } else {
      toast('Ошибка оплаты — попробуй снова');
    }
  });
},
```

---

## Структура сервера

```
backend/
├── index.js            ← Express app, регистрация роутов
├── routes/
│   ├── orders.js       ← POST /api/orders
│   └── webhook.js      ← POST /api/webhook/telegram
├── services/
│   ├── telegram.js     ← bot API вызовы (createInvoiceLink, sendMessage)
│   ├── payments.js     ← YooKassa
│   └── db.js           ← запросы к PostgreSQL (pg)
└── middleware/
    └── verifyInitData.js  ← верификация подписи Telegram
```

---

## Что НЕ нужно на первом этапе

| Что | Почему не нужно |
|-----|----------------|
| Личный кабинет покупателя | Менеджер пишет напрямую в Telegram — история заказов не нужна |
| REST API для каталога | Каталог статичен, hardcoded в catalog.js |
| Авторизация и JWT | initData Telegram — достаточная идентификация |
| История заказов в Mini App | В первой версии нет смысла, добавить после |
| Адрес и телефон в форме | Менеджер уточняет в переписке — не нужно тащить в форму |
| Отдельный фронтенд для менеджера | Бот-команды покрывают все нужды |
| Redis / очереди | Объём не тот |
| Docker | Railway справляется без него |

---

## Порядок реализации

1. **Зарегистрировать ЮKassa** → получить `shop_id` и `secret_key` → подключить как провайдера в BotFather (`/mybots → Payments`)
2. **Создать Railway-проект** → добавить PostgreSQL → создать таблицу `orders`
3. **Написать сервер** → `/api/orders` + `/api/webhook/telegram` + верификация initData
4. **Установить webhook** на бота: `setWebhook` на URL Railway
5. **Изменить `App._submit()`** в app.js → переключить с `sendMessage` на `openInvoice`
6. **Тест** в Telegram: оформить заказ, убедиться что в БД появилась запись, менеджеру пришло уведомление
7. **Убрать** `BOT_TOKEN` из `tg-app/js/config.js` фронтенда (токен переезжает на сервер)
