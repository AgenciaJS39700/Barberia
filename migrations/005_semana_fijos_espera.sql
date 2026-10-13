-- Bloqueos fijos (p. ej. comida todos los días, lunes libres) y lista de espera
ALTER TABLE blocks ADD COLUMN rule_id INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_blocks_rule ON blocks(rule_id, start_at) WHERE rule_id IS NOT NULL;
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
