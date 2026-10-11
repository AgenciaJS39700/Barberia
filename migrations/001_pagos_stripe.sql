-- Pagos con Stripe (ejecutar una sola vez en bases de datos ya creadas)
ALTER TABLE bookings ADD COLUMN pay_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE bookings ADD COLUMN pay_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN pay_expires TEXT;
ALTER TABLE bookings ADD COLUMN stripe_session TEXT;
ALTER TABLE bookings ADD COLUMN stripe_pi TEXT;
