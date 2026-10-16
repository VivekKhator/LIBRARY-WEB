-- BiblioBazaar schema. Money is stored as integer cents. Timestamps are ISO-8601 UTC strings.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT    NOT NULL UNIQUE,
  password_hash  TEXT    NOT NULL,
  name           TEXT    NOT NULL,
  role           TEXT    NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','seller','admin')),
  status         TEXT    NOT NULL DEFAULT 'active'   CHECK (status IN ('active','suspended')),
  bio            TEXT    NOT NULL DEFAULT '',
  store_name     TEXT,
  store_slug     TEXT UNIQUE,
  store_bio      TEXT    NOT NULL DEFAULT '',
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token  TEXT    NOT NULL,
  user_agent  TEXT    NOT NULL DEFAULT '',
  ip          TEXT    NOT NULL DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT   NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT 'book',
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title             TEXT    NOT NULL,
  author            TEXT    NOT NULL,
  isbn              TEXT    NOT NULL DEFAULT '',
  description       TEXT    NOT NULL DEFAULT '',
  category_id       INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  condition         TEXT    NOT NULL DEFAULT 'good'      CHECK (condition IN ('new','like_new','good','fair')),
  format            TEXT    NOT NULL DEFAULT 'paperback' CHECK (format IN ('paperback','hardcover','ebook','audiobook')),
  language          TEXT    NOT NULL DEFAULT 'English',
  publisher         TEXT    NOT NULL DEFAULT '',
  published_year    INTEGER,
  pages             INTEGER,
  price_cents       INTEGER NOT NULL CHECK (price_cents >= 0),
  sale_enabled      INTEGER NOT NULL DEFAULT 1 CHECK (sale_enabled IN (0,1)),
  rent_enabled      INTEGER NOT NULL DEFAULT 0 CHECK (rent_enabled IN (0,1)),
  rent_weekly_cents INTEGER NOT NULL DEFAULT 0 CHECK (rent_weekly_cents >= 0),
  stock             INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  rent_stock        INTEGER NOT NULL DEFAULT 0 CHECK (rent_stock >= 0),
  status            TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('draft','pending','active','rejected','archived')),
  moderation_note   TEXT    NOT NULL DEFAULT '',
  cover_url         TEXT    NOT NULL DEFAULT '',
  cover_seed        INTEGER NOT NULL DEFAULT 0,
  views             INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_books_status   ON books(status);
CREATE INDEX IF NOT EXISTS idx_books_seller   ON books(seller_id);
CREATE INDEX IF NOT EXISTS idx_books_category ON books(category_id);
CREATE INDEX IF NOT EXISTS idx_books_price    ON books(price_cents);

CREATE TABLE IF NOT EXISTS addresses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT NOT NULL DEFAULT 'Home',
  full_name   TEXT NOT NULL,
  line1       TEXT NOT NULL,
  line2       TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL,
  state       TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL,
  country     TEXT NOT NULL DEFAULT 'United States',
  phone       TEXT NOT NULL DEFAULT '',
  is_default  INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

CREATE TABLE IF NOT EXISTS cart_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  mode       TEXT    NOT NULL CHECK (mode IN ('buy','rent')),
  quantity   INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  rent_weeks INTEGER NOT NULL DEFAULT 0 CHECK (rent_weeks >= 0),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, book_id, mode)
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, book_id)
);

CREATE TABLE IF NOT EXISTS coupons (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  code               TEXT    NOT NULL UNIQUE,
  description        TEXT    NOT NULL DEFAULT '',
  kind               TEXT    NOT NULL CHECK (kind IN ('percent','fixed')),
  value              INTEGER NOT NULL CHECK (value > 0),
  min_subtotal_cents INTEGER NOT NULL DEFAULT 0,
  max_discount_cents INTEGER NOT NULL DEFAULT 0,
  usage_limit        INTEGER NOT NULL DEFAULT 0,
  used_count         INTEGER NOT NULL DEFAULT 0,
  expires_at         TEXT,
  active             INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number    TEXT    NOT NULL UNIQUE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          TEXT    NOT NULL DEFAULT 'paid'
                  CHECK (status IN ('paid','packed','shipped','delivered','cancelled','refunded')),
  subtotal_cents  INTEGER NOT NULL DEFAULT 0,
  discount_cents  INTEGER NOT NULL DEFAULT 0,
  shipping_cents  INTEGER NOT NULL DEFAULT 0,
  tax_cents       INTEGER NOT NULL DEFAULT 0,
  total_cents     INTEGER NOT NULL DEFAULT 0,
  coupon_code     TEXT    NOT NULL DEFAULT '',
  shipping_method TEXT    NOT NULL DEFAULT 'standard',
  payment_brand   TEXT    NOT NULL DEFAULT '',
  payment_last4   TEXT    NOT NULL DEFAULT '',
  payment_ref     TEXT    NOT NULL DEFAULT '',
  address_json    TEXT    NOT NULL DEFAULT '{}',
  notes           TEXT    NOT NULL DEFAULT '',
  placed_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  book_id     INTEGER REFERENCES books(id) ON DELETE SET NULL,
  seller_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT    NOT NULL,
  author      TEXT    NOT NULL,
  cover_seed  INTEGER NOT NULL DEFAULT 0,
  cover_url   TEXT    NOT NULL DEFAULT '',
  mode        TEXT    NOT NULL CHECK (mode IN ('buy','rent')),
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  rent_weeks  INTEGER NOT NULL DEFAULT 0,
  unit_cents  INTEGER NOT NULL,
  line_cents  INTEGER NOT NULL,
  fulfillment TEXT    NOT NULL DEFAULT 'processing'
              CHECK (fulfillment IN ('processing','packed','shipped','delivered','cancelled')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_order_items_order  ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller ON order_items(seller_id);

CREATE TABLE IF NOT EXISTS order_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  label      TEXT    NOT NULL,
  detail     TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);

CREATE TABLE IF NOT EXISTS loans (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_id       INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  order_id      INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  order_item_id INTEGER REFERENCES order_items(id) ON DELETE SET NULL,
  weeks         INTEGER NOT NULL CHECK (weeks > 0),
  started_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  due_at        TEXT    NOT NULL,
  returned_at   TEXT,
  extensions    INTEGER NOT NULL DEFAULT 0,
  late_fee_cents INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','returned'))
);
CREATE INDEX IF NOT EXISTS idx_loans_user ON loans(user_id);

CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id    INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title      TEXT    NOT NULL DEFAULT '',
  body       TEXT    NOT NULL DEFAULT '',
  verified   INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (book_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_book ON reviews(book_id);

CREATE TABLE IF NOT EXISTS review_votes (
  review_id  INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (review_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL DEFAULT 'info',
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL DEFAULT '',
  link       TEXT    NOT NULL DEFAULT '',
  read_at    TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

-- Aggregated rating per book, always consistent with the reviews table.
CREATE VIEW IF NOT EXISTS book_ratings AS
  SELECT book_id,
         COUNT(*)                      AS review_count,
         ROUND(AVG(rating), 2)         AS rating_avg,
         SUM(rating = 5)               AS stars5,
         SUM(rating = 4)               AS stars4,
         SUM(rating = 3)               AS stars3,
         SUM(rating = 2)               AS stars2,
         SUM(rating = 1)               AS stars1
  FROM reviews GROUP BY book_id;

-- Units sold per book, used for popularity sorting and seller analytics.
CREATE VIEW IF NOT EXISTS book_sales AS
  SELECT oi.book_id,
         SUM(oi.quantity)   AS units_sold,
         SUM(oi.line_cents) AS revenue_cents
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.status NOT IN ('cancelled','refunded') AND oi.fulfillment <> 'cancelled'
  GROUP BY oi.book_id;
