# Infinity Barber · web con reservas, club y "Encuentra tu corte"

Cloudflare Worker + D1 (`barberia`) + correos con Brevo. Todo gratis en el plan free.

## Qué incluye
- **Reservas reales** (`#reservas`): servicio → barbero → día → hora libre. Sin dobles reservas (comprobación atómica en la base de datos), antelación mínima, cancelación por enlace hasta 2 h antes, límite de 3 citas pendientes por teléfono.
- **Correos**: confirmación con enlace para cancelar, recordatorio 24 h y 2 h antes (Cron cada 15 min), aviso al dueño por cada cita nueva o cancelada.
- **Cuentas y Club** (`#club`): registro, login, recuperar contraseña, borrar cuenta; puntos de bienvenida y por euro gastado, premios canjeables con código, puntos por recomendar a un amigo.
- **Encuentra tu corte** (`#cortes`): galería de 111 estilos con filtros, test de 5 preguntas, análisis de la forma de cara en el móvil (la foto no se sube) y probador con IA (apagado).
- **Panel** `/admin.html`: agenda del día, citas por teléfono, bloqueos, avisos por WhatsApp, clientes y puntos, canjes, ajustes (servicios, barberos, premios, horario, reglas) y resumen.
- Si el servidor no responde, la web sigue funcionando con la reserva por WhatsApp de siempre.

## Puesta en marcha (una vez)
1. Cloudflare → Worker `barberia` → Settings → Variables and Secrets → añadir los secretos:
   - `ADMIN_TOKEN`: contraseña del panel `/admin.html` (larga y única).
   - `BREVO_API_KEY`: para enviar correos (sin ella todo funciona, pero no salen correos).
2. La base de datos `barberia` ya está creada con las tablas y los datos de ejemplo (`schema.sql`, `seed.sql`).
3. Cambiar en `wrangler.jsonc` los datos reales del cliente (teléfono, WhatsApp, correos, dirección) y en el panel → Ajustes los servicios, barberos y horario.
4. Sin dominio propio verificado en Brevo (SPF/DKIM/DMARC) los correos pueden ir a spam.

## Fotos de los cortes
En `cortes.js` poner `BB.photos = true` y subir `img/cortes/<id>.webp` (el `id` aparece en el catálogo, p. ej. `crop-low.webp`). Mientras tanto se muestran ilustraciones.

## Probador con IA (apagado por defecto: cuesta dinero por uso)
Para activarlo: secreto `FAL_KEY` y variable `TRYON=1`. Solo para socios con sesión, máx. 2 pruebas/día por socio (`TRYON_DAILY`) y 30 al día en total (`TRYON_GLOBAL_DAILY`). El texto del peinado lo fija el servidor. Aviso legal: la foto se envía a un tercero (fal.ai); hay casilla de consentimiento y debe constar en la política de privacidad.

## Archivos
`index.html` · `app.js` · `app.css` · `cortes.js` · `admin.html` · `worker.js` · `wrangler.jsonc` · `schema.sql` · `seed.sql`


## Pagos con Stripe (señal o corte pagado)

Funciona con Stripe Checkout (página de pago de Stripe, sin datos de tarjeta en tu web). La cita se confirma cuando Stripe avisa por webhook firmado.

1. **Base de datos (una sola vez, instalaciones ya creadas):** ejecutar `migrations/001_pagos_stripe.sql` en la D1.
2. **Stripe** (empezar en modo pruebas): Developers → API keys → copiar la *Secret key* (`sk_test_...`).
3. **Webhook:** Developers → Webhooks → Add endpoint → URL `https://TU-DOMINIO/api/stripe/webhook` → eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` y `checkout.session.expired`. Copiar el *Signing secret* (`whsec_...`).
4. **Secretos en Cloudflare** (Workers → barberia → Settings → Variables and Secrets, tipo *Secret*): `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET`. Nunca en el repo.
5. **Elegir cómo cobrar:** `/admin.html` → Ajustes → *Pagos online*: sin pago / el cliente elige / señal obligatoria / pago completo.
6. **Probar** con la tarjeta `4242 4242 4242 4242` (cualquier fecha futura y CVC). Comprobar: cita pagada en la agenda, correo al cliente y aviso al dueño, cancelación con reembolso.
7. **Pasar a real** solo cuando todo funcione: cambiar a la clave `sk_live_...`, crear el webhook en modo real y actualizar `STRIPE_WEBHOOK_SECRET`.

Reglas: el hueco queda retenido ~30 min mientras se paga; si no se paga, se libera solo. **El pago online es completo y NO reembolsable**: el cliente acepta una casilla al reservar y solo puede *cambiar la fecha* (hasta las horas de «Cancelar hasta», máx. 2 cambios, desde el enlace del correo o su cuenta). Las citas pagadas en la barbería sí se cancelan gratis. El dueño puede reembolsar una excepción desde la agenda (botón «Reembolsar»). Aviso: revisar con un profesional que esta condición encaja con la normativa de consumo.

Base de datos ya creada: ejecutar también `migrations/002_cambios_de_fecha.sql` (columna `moves`).
