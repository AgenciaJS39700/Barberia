-- Barbería · esquema D1 (SQLite). Fechas/horas de citas como texto local "YYYY-MM-DD HH:MM" (Europe/Madrid).
CREATE TABLE services (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, minutes INTEGER NOT NULL CHECK (minutes BETWEEN 5 AND 480), price_cents INTEGER NOT NULL CHECK (price_cents >= 0), active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE barbers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0);
CREATE TABLE settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, phone TEXT, pass_hash TEXT NOT NULL, pass_salt TEXT NOT NULL, pass_iter INTEGER NOT NULL, marketing INTEGER NOT NULL DEFAULT 0, marketing_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), terms_at TEXT, ref_code TEXT UNIQUE, referred_by INTEGER, ref_paid INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE TABLE resets (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE auth_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, k TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX idx_attempts ON auth_attempts(k, ts);
CREATE TABLE bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT,
  service_id INTEGER NOT NULL REFERENCES services(id), service_name TEXT NOT NULL, price_cents INTEGER NOT NULL,
  barber_id INTEGER NOT NULL REFERENCES barbers(id),
  start_at TEXT NOT NULL, end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','done','noshow','cancelled')),
  r24 INTEGER NOT NULL DEFAULT 0, r2 INTEGER NOT NULL DEFAULT 0, points_done INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'web', note TEXT, terms_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  pay_status TEXT NOT NULL DEFAULT 'none', pay_cents INTEGER NOT NULL DEFAULT 0, pay_expires TEXT, stripe_session TEXT, stripe_pi TEXT, moves INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_bk_day ON bookings(barber_id, start_at);
CREATE INDEX idx_bk_user ON bookings(user_id, start_at);
CREATE INDEX idx_bk_status ON bookings(status, start_at);
CREATE TABLE blocks (id INTEGER PRIMARY KEY AUTOINCREMENT, barber_id INTEGER, start_at TEXT NOT NULL, end_at TEXT NOT NULL, note TEXT, rule_id INTEGER);
CREATE UNIQUE INDEX IF NOT EXISTS idx_blocks_rule ON blocks(rule_id, start_at) WHERE rule_id IS NOT NULL;
CREATE INDEX idx_blocks ON blocks(start_at);
CREATE TABLE points (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, delta INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX idx_points_user ON points(user_id);
CREATE TABLE rewards (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, cost INTEGER NOT NULL CHECK (cost > 0), active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE redemptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, reward_id INTEGER NOT NULL, reward_name TEXT NOT NULL, cost INTEGER NOT NULL, code TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','used')), created_at TEXT NOT NULL DEFAULT (datetime('now')), used_at TEXT);
CREATE TABLE tryon_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, day TEXT NOT NULL);
CREATE INDEX idx_tryon ON tryon_log(user_id, day);
-- Avisos push (PWA): móviles del barbero (role='admin') y de clientes con una cita (role='client')
CREATE TABLE IF NOT EXISTS push_subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','client')),
  booking_code TEXT NOT NULL DEFAULT '',
  barber_id INTEGER, -- avisos de admin: NULL = jefe (recibe todas las citas); si no, solo las de ese barbero
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (endpoint, role, booking_code)
);
CREATE INDEX IF NOT EXISTS idx_push_booking ON push_subs(booking_code, role);
CREATE INDEX IF NOT EXISTS idx_push_endpoint ON push_subs(endpoint);
CREATE INDEX IF NOT EXISTS idx_push_barber ON push_subs(role, barber_id);
-- Equipo (migración 004): acceso personal por barbero, notas de cliente y registro de actividad
CREATE TABLE IF NOT EXISTS staff (barber_id INTEGER PRIMARY KEY REFERENCES barbers(id) ON DELETE CASCADE, key_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_seen TEXT);
CREATE TABLE IF NOT EXISTS client_notes (phone TEXT PRIMARY KEY, note TEXT NOT NULL, updated_by TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');
CREATE INDEX IF NOT EXISTS idx_bk_phone ON bookings(phone);
CREATE TABLE IF NOT EXISTS block_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barber_id INTEGER,                 -- NULL = todo el local
  weekdays TEXT NOT NULL,            -- "1,2,3" (0 = domingo)
  start_time TEXT NOT NULL,          -- HH:MM
  end_time TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  from_date TEXT NOT NULL,
  until_date TEXT,                   -- NULL = sin fin
  created_by TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS block_skips (
  rule_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY (rule_id, day)
);
CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  service_id INTEGER NOT NULL,
  barber_id INTEGER NOT NULL DEFAULT 0,   -- 0 = cualquiera
  day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','notified','removed')),
  notified_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_wait_day ON waitlist(status, day);
