-- Avisos push (PWA): móviles del barbero (role='admin') y de clientes con una cita (role='client')
CREATE TABLE IF NOT EXISTS push_subs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','client')),
  booking_code TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (endpoint, role, booking_code)
);
CREATE INDEX IF NOT EXISTS idx_push_booking ON push_subs(booking_code, role);
CREATE INDEX IF NOT EXISTS idx_push_endpoint ON push_subs(endpoint);
