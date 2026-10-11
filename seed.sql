-- Datos de ejemplo de Infinity Barber (editables desde el panel /admin.html)
INSERT INTO services (name, minutes, price_cents, sort) VALUES
 ('Corte de pelo tradicional / moderno', 30, 1400, 1),
 ('Degradado / Fade', 40, 1500, 2),
 ('Arreglo y perfilado de barba', 20, 1000, 3),
 ('Combo corte + barba', 55, 2200, 4),
 ('Tratamiento capilar y peinado', 30, 1800, 5);
INSERT INTO barbers (name, sort) VALUES ('Álex', 1), ('Dani', 2);
INSERT INTO settings (k, v) VALUES
 ('hours', '{"1":[["10:00","14:00"],["16:30","20:30"]],"2":[["10:00","14:00"],["16:30","20:30"]],"3":[["10:00","14:00"],["16:30","20:30"]],"4":[["10:00","14:00"],["16:30","20:30"]],"5":[["10:00","14:00"],["16:30","20:30"]],"6":[["09:00","14:00"]],"0":[]}'),
 ('rules', '{"stepMin":30,"leadMin":60,"cancelMin":120,"maxDays":45,"pointsPerEuro":1,"welcomePoints":10,"referralPoints":20}');
INSERT INTO rewards (name, cost) VALUES ('Cera o producto de regalo', 60), ('Arreglo de barba gratis', 120), ('Corte gratis', 250);
