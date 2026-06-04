-- ============================================================
-- Pro-Marker — схема базы данных
-- Запускать в Supabase: SQL Editor → New query → Run
-- ============================================================

-- Таблица заказов
CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  order_no       TEXT NOT NULL UNIQUE,        -- "#4721", генерируется на сервере

  -- Кто заказал (из Telegram initData, верифицируется сервером)
  tg_user_id     BIGINT NOT NULL,
  tg_username    TEXT,                        -- @handle, может быть NULL
  tg_fullname    TEXT NOT NULL,               -- first_name + last_name из Telegram

  -- Имя из формы
  recipient_name TEXT NOT NULL,

  -- Состав заказа
  items          JSONB NOT NULL,
  -- Пример: [{ "id": "h-r-1", "name": "Пастельный рассвет",
  --             "qty": 2, "price": 690, "catLabel": "Текстовыделители" }]
  total_rub      INTEGER NOT NULL,

  -- Оплата
  payment_id     TEXT,                        -- ID транзакции от Telegram Payments
  paid_at        TIMESTAMPTZ,

  -- Статус
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','paid','contacted','shipped','done')),

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для быстрой фильтрации в дашборде и bot-командах
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_tg_user_id ON orders(tg_user_id);

-- ============================================================
-- Row Level Security
-- Прямой доступ из браузера (anon/authenticated) закрыт.
-- Сервер (Node.js) подключается через service_role — обходит RLS.
-- ============================================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Никаких публичных политик — таблица доступна только сервис-роли
-- (service_role ключ на Railway, не попадает во фронтенд)
