-- Equipo: acceso personal para cada barbero, notas de cliente, registro de actividad y avisos por barbero
CREATE TABLE IF NOT EXISTS staff (
  barber_id INTEGER PRIMARY KEY REFERENCES barbers(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT
);
ALTER TABLE push_subs ADD COLUMN barber_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_push_barber ON push_subs(role, barber_id);
CREATE TABLE IF NOT EXISTS client_notes (
  phone TEXT PRIMARY KEY,
  note TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_bk_phone ON bookings(phone);
