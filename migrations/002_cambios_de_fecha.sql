-- Cambios de fecha de citas pagadas (ejecutar una sola vez en bases de datos ya creadas)
ALTER TABLE bookings ADD COLUMN moves INTEGER NOT NULL DEFAULT 0;
