// worker.js · API de Infinity Barber (Cloudflare Workers + D1)
// Reservas con huecos reales, cuentas, club de puntos, recordatorios por correo (Cron) y panel de administración.
// Público: GET /api/config · GET /api/availability · POST /api/book · GET /api/booking · POST /api/cancel
//          /api/auth/{register,login,logout,forgot,reset,marketing,delete} · GET /api/me · POST /api/club/redeem · POST /api/tryon
// Admin:   /api/admin/*  (cabecera x-admin-token)
// Secretos: ADMIN_TOKEN · BREVO_API_KEY (opcional) · FAL_KEY (opcional, solo para el probador con IA)
// Variables: SHOP_NAME · MAIL_FROM · MAIL_FROM_NAME · OWNER_EMAIL · SHOP_PHONE · SHOP_WHATSAPP · SHOP_ADDRESS · SITE_URL · BREVO_LIST_ID · PBKDF2_ITER · TRYON (1 = activar probador IA)

const TZ = "Europe/Madrid";
const SESSION_DAYS = 30;
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MIN = 15;
const MAX_FUTURE_PER_PHONE = 3;
const te = new TextEncoder();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith("/api/auth/")) return await auth(request, env, url, ctx);
      if (path.startsWith("/api/admin/")) return await admin(request, env, url, ctx);
      if (path === "/api/config" && request.method === "GET") return await config(env);
      if (path === "/api/availability" && request.method === "GET") return await availability(env, url);
      if (path === "/api/book" && request.method === "POST") return await book(request, env, url, ctx);
      if (path === "/api/booking" && request.method === "GET") return await bookingInfo(env, url);
      if (path === "/api/cancel" && request.method === "POST") return await cancelBooking(request, env, url, ctx);
      if (path === "/api/me" && request.method === "GET") return await me(request, env);
      if (path === "/api/club/redeem" && request.method === "POST") return await redeem(request, env, url);
      if (path === "/api/tryon" && request.method === "POST") return await tryon(request, env, url);
      if (path.startsWith("/api/")) return json({ error: "No encontrado" }, 404);
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response("No encontrado", { status: 404 });
    } catch (err) {
      console.error("Error no controlado:", err && err.message);
      ctx.waitUntil(alertOwner(env, "Error interno en " + path, err && err.message));
      return json({ error: "Error interno" }, 500);
    }
  },
  // Cron (cada 15 min): recordatorios de cita por correo
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendReminders(env).catch((e) => console.error("recordatorios", e && e.message)));
  },
};

/* ------------------------------------------------------------------ utilidades */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function safeEqual(a, b) {
  const x = String(a), y = String(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
async function sha256(text) { return hex(await crypto.subtle.digest("SHA-256", te.encode(text))); }
const escHtml = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const eur = (c) => (c / 100).toFixed(2).replace(".", ",") + " €";
const shopName = (env) => env.SHOP_NAME || "Infinity Barber";
const publicOrigin = (env, request) => env.SITE_URL || new URL(request.url).origin;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const cleanEmail = (v) => String(v || "").trim().toLowerCase().slice(0, 254);
const cleanName = (v) => String(v || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 60);
const cleanPhone = (v) => { const d = String(v || "").replace(/[^\d+]/g, ""); return /^\+?\d{9,15}$/.test(d) ? d : ""; };

async function getJson(request) { try { return await request.json(); } catch { return {}; } }
function sameOrigin(request, url) { return request.headers.get("origin") === url.origin; }

/* ------------------------------------------------------------------ fechas (hora local de Madrid como texto) */
function nowLocal(env) {
  if (env && env.TEST_NOW) return env.TEST_NOW; // solo para pruebas
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(/ /g, " ");
}
const toMin = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const fromMin = (m) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
function dateObj(d) { return new Date(d + "T00:00:00Z"); }
function addDays(d, n) { const o = dateObj(d); o.setUTCDate(o.getUTCDate() + n); return o.toISOString().slice(0, 10); }
function weekday(d) { return dateObj(d).getUTCDay(); }
function dtMin(dt) { return Math.floor(Date.UTC(+dt.slice(0, 4), +dt.slice(5, 7) - 1, +dt.slice(8, 10), +dt.slice(11, 13), +dt.slice(14, 16)) / 60000); }
function addMin(dt, n) {
  const t = new Date((dtMin(dt) + n) * 60000);
  return t.toISOString().slice(0, 10) + " " + t.toISOString().slice(11, 16);
}
const diffMin = (a, b) => dtMin(a) - dtMin(b);
const fmtDate = (dt) => {
  const days = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const d = dateObj(dt.slice(0, 10));
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} de ${months[d.getUTCMonth()]} a las ${dt.slice(11, 16)}`;
};

/* ------------------------------------------------------------------ configuración */
async function setting(env, k, fallback) {
  const r = await env.DB.prepare("SELECT v FROM settings WHERE k = ?1").bind(k).first();
  if (!r) return fallback;
  try { return JSON.parse(r.v); } catch { return fallback; }
}
const RULES_DEFAULT = { stepMin: 30, leadMin: 60, cancelMin: 120, maxDays: 45, pointsPerEuro: 1, welcomePoints: 10, referralPoints: 20 };
async function rules(env) { return { ...RULES_DEFAULT, ...(await setting(env, "rules", {})) }; }

async function config(env) {
  const [services, barbers, hours, rewards, r] = await Promise.all([
    env.DB.prepare("SELECT id, name, minutes, price_cents FROM services WHERE active = 1 ORDER BY sort, id").all(),
    env.DB.prepare("SELECT id, name FROM barbers WHERE active = 1 ORDER BY sort, id").all(),
    setting(env, "hours", {}),
    env.DB.prepare("SELECT id, name, cost FROM rewards WHERE active = 1 ORDER BY cost").all(),
    rules(env),
  ]);
  return json({
    shop: { name: shopName(env), phone: env.SHOP_PHONE || "", whatsapp: env.SHOP_WHATSAPP || "", address: env.SHOP_ADDRESS || "" },
    services: services.results, barbers: barbers.results, hours, rewards: rewards.results,
    rules: { leadMin: r.leadMin, cancelMin: r.cancelMin, maxDays: r.maxDays, pointsPerEuro: r.pointsPerEuro, welcomePoints: r.welcomePoints, referralPoints: r.referralPoints },
    tryon: tryonEnabled(env),
  });
}

/* ------------------------------------------------------------------ huecos libres */
// Devuelve, para un día, los huecos libres de un servicio. barberId 0 = cualquiera.
async function freeSlots(env, date, service, barberId, { ignoreLead = false } = {}) {
  const r = await rules(env);
  const hours = await setting(env, "hours", {});
  const windows = hours[String(weekday(date))] || [];
  if (!windows.length) return [];
  const barbers = (await env.DB.prepare(barberId ? "SELECT id FROM barbers WHERE active = 1 AND id = ?1" : "SELECT id FROM barbers WHERE active = 1 ORDER BY sort, id").bind(...(barberId ? [barberId] : [])).all()).results;
  if (!barbers.length) return [];
  const dayStart = date + " 00:00", dayEnd = addDays(date, 1) + " 00:00";
  const [bk, bl] = await Promise.all([
    env.DB.prepare("SELECT barber_id, start_at, end_at FROM bookings WHERE status IN ('booked','done') AND start_at < ?2 AND end_at > ?1").bind(dayStart, dayEnd).all(),
    env.DB.prepare("SELECT barber_id, start_at, end_at FROM blocks WHERE start_at < ?2 AND end_at > ?1").bind(dayStart, dayEnd).all(),
  ]);
  const busy = (bid, s, e) => bk.results.some((x) => x.barber_id === bid && x.start_at < e && x.end_at > s) ||
    bl.results.some((x) => (x.barber_id == null || x.barber_id === bid) && x.start_at < e && x.end_at > s);
  const now = nowLocal(env);
  const minStart = addMin(now, ignoreLead ? 0 : r.leadMin);
  const out = [];
  for (const [open, close] of windows) {
    for (let m = toMin(open); m + service.minutes <= toMin(close); m += r.stepMin) {
      const s = date + " " + fromMin(m), e = addMin(s, service.minutes);
      if (s < minStart) continue;
      const free = barbers.filter((b) => !busy(b.id, s, e)).map((b) => b.id);
      if (free.length) out.push({ time: fromMin(m), barbers: free });
    }
  }
  return out;
}

async function availability(env, url) {
  const date = url.searchParams.get("date") || "";
  const serviceId = Number(url.searchParams.get("service"));
  const barberId = Number(url.searchParams.get("barber") || 0) || 0;
  if (!DATE_RE.test(date) || !Number.isInteger(serviceId)) return json({ error: "Datos no válidos" }, 400);
  const r = await rules(env);
  const today = nowLocal(env).slice(0, 10);
  if (date < today || date > addDays(today, r.maxDays)) return json({ slots: [] });
  const service = await env.DB.prepare("SELECT id, minutes FROM services WHERE id = ?1 AND active = 1").bind(serviceId).first();
  if (!service) return json({ error: "Servicio no encontrado" }, 404);
  const slots = await freeSlots(env, date, service, barberId);
  return json({ slots: slots.map((s) => ({ time: s.time, barbers: s.barbers })) });
}

/* ------------------------------------------------------------------ reservas */
async function currentUser(request, env) {
  const tok = getCookie(request, "sid");
  if (!/^[0-9a-f]{64}$/.test(tok)) return null;
  return (await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.phone, u.marketing, u.ref_code FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?1 AND s.expires_at > datetime('now')`
  ).bind(await sha256(tok)).first()) || null;
}

async function insertBooking(env, b) {
  // Un solo INSERT ... SELECT atómico: solo entra si el hueco sigue libre (sin solapes con otras citas ni bloqueos)
  const r = await env.DB.prepare(
    `INSERT INTO bookings (code, user_id, name, phone, email, service_id, service_name, price_cents, barber_id, start_at, end_at, source, terms_at, note)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
     WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE barber_id = ?9 AND status IN ('booked','done') AND start_at < ?11 AND end_at > ?10)
       AND NOT EXISTS (SELECT 1 FROM blocks WHERE (barber_id IS NULL OR barber_id = ?9) AND start_at < ?11 AND end_at > ?10)`
  ).bind(b.code, b.user_id || null, b.name, b.phone, b.email || null, b.service_id, b.service_name, b.price_cents, b.barber_id, b.start_at, b.end_at, b.source, b.terms_at || null, b.note || null).run();
  return r.meta.changes === 1;
}

async function book(request, env, url, ctx) {
  if (!sameOrigin(request, url)) return json({ error: "Origen no permitido." }, 403);
  const body = await getJson(request);
  const name = cleanName(body.name), phone = cleanPhone(body.phone);
  const emailRaw = cleanEmail(body.email);
  const email = emailRaw && EMAIL_RE.test(emailRaw) ? emailRaw : "";
  const serviceId = Number(body.service), barberId = Number(body.barber || 0) || 0;
  const start = String(body.start || "");
  if (!name) return json({ error: "Escribe tu nombre." }, 400);
  if (!phone) return json({ error: "Escribe un teléfono válido (con 9 dígitos o más)." }, 400);
  if (emailRaw && !email) return json({ error: "El correo no es válido." }, 400);
  if (body.terms !== true) return json({ error: "Debes aceptar la política de privacidad." }, 400);
  if (!DT_RE.test(start) || !Number.isInteger(serviceId)) return json({ error: "Datos no válidos" }, 400);

  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const keys = [`book:ip:${ip}`, `book:ph:${phone}`];
  if (await tooMany(env, keys, 10)) return TOO_MANY();
  await hit(env, keys);

  const service = await env.DB.prepare("SELECT id, name, minutes, price_cents FROM services WHERE id = ?1 AND active = 1").bind(serviceId).first();
  if (!service) return json({ error: "Servicio no encontrado" }, 404);
  const r = await rules(env);
  const now = nowLocal(env);
  const date = start.slice(0, 10);
  if (date > addDays(now.slice(0, 10), r.maxDays)) return json({ error: "Solo se puede reservar con unas semanas de antelación." }, 400);

  const slots = await freeSlots(env, date, service, barberId);
  const slot = slots.find((s) => s.time === start.slice(11));
  if (!slot) return json({ error: "Ese hueco ya no está libre. Elige otra hora." }, 409);

  const pending = await env.DB.prepare("SELECT COUNT(*) AS n FROM bookings WHERE status = 'booked' AND start_at >= ?2 AND phone = ?1").bind(phone, now).first();
  if (pending.n >= MAX_FUTURE_PER_PHONE) return json({ error: `Ya tienes ${MAX_FUTURE_PER_PHONE} citas pendientes. Cancela una o llámanos.` }, 409);

  const user = await currentUser(request, env);
  const end = addMin(start, service.minutes);
  // Con "cualquiera": se asigna el barbero libre con menos citas ese día
  let chosen = barberId && slot.barbers.includes(barberId) ? barberId : slot.barbers[0];
  if (!barberId && slot.barbers.length > 1) {
    const loads = await env.DB.prepare(`SELECT barber_id, COUNT(*) AS n FROM bookings WHERE status IN ('booked','done') AND start_at >= ?1 AND start_at < ?2 GROUP BY barber_id`).bind(date + " 00:00", addDays(date, 1) + " 00:00").all();
    const n = (id) => (loads.results.find((x) => x.barber_id === id) || { n: 0 }).n;
    chosen = slot.barbers.slice().sort((a, b) => n(a) - n(b))[0];
  }
  const code = randomHex(12);
  const ok = await insertBooking(env, {
    code, user_id: user ? user.id : null, name, phone, email: email || (user ? user.email : ""), service_id: service.id, service_name: service.name,
    price_cents: service.price_cents, barber_id: chosen, start_at: start, end_at: end, source: "web", terms_at: new Date().toISOString(), note: String(body.note || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 120),
  });
  if (!ok) return json({ error: "Ese hueco se acaba de ocupar. Elige otra hora." }, 409);
  const barber = await env.DB.prepare("SELECT name FROM barbers WHERE id = ?1").bind(chosen).first();
  const b = { code, name, phone, email: email || (user ? user.email : ""), service_name: service.name, price_cents: service.price_cents, start_at: start, barber_name: barber ? barber.name : "" };
  ctx.waitUntil(Promise.all([
    b.email ? mailBooked(env, b, publicOrigin(env, request)) : Promise.resolve(),
    alertOwner(env, `Nueva cita: ${name} · ${fmtDate(start)}`, `${service.name} con ${b.barber_name}. Tel. ${phone}`, true),
  ]).catch((e) => console.error("mail", e && e.message)));
  return json({ ok: true, booking: publicBooking(b) }, 201);
}

const publicBooking = (b) => ({ code: b.code, name: b.name, service: b.service_name, price_cents: b.price_cents, start: b.start_at, barber: b.barber_name, whenText: fmtDate(b.start_at) });

async function bookingInfo(env, url) {
  const code = url.searchParams.get("code") || "";
  if (!/^[0-9a-f]{24}$/.test(code)) return json({ error: "Cita no encontrada" }, 404);
  const b = await env.DB.prepare(
    `SELECT b.code, b.name, b.service_name, b.price_cents, b.start_at, b.status, br.name AS barber_name FROM bookings b JOIN barbers br ON br.id = b.barber_id WHERE b.code = ?1`
  ).bind(code).first();
  if (!b) return json({ error: "Cita no encontrada" }, 404);
  const r = await rules(env);
  const canCancel = b.status === "booked" && diffMin(b.start_at, nowLocal(env)) >= r.cancelMin;
  return json({ booking: { ...publicBooking(b), status: b.status }, canCancel, cancelMin: r.cancelMin });
}

async function cancelBooking(request, env, url, ctx) {
  if (!sameOrigin(request, url)) return json({ error: "Origen no permitido." }, 403);
  const body = await getJson(request);
  const code = String(body.code || "");
  if (!/^[0-9a-f]{24}$/.test(code)) return json({ error: "Cita no encontrada" }, 404);
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  if (await tooMany(env, [`cancel:ip:${ip}`], 20)) return TOO_MANY();
  await hit(env, [`cancel:ip:${ip}`]);
  const b = await env.DB.prepare("SELECT id, name, email, phone, service_name, start_at, status FROM bookings WHERE code = ?1").bind(code).first();
  if (!b || b.status !== "booked") return json({ error: "Esa cita ya no se puede cancelar." }, 409);
  const r = await rules(env);
  if (diffMin(b.start_at, nowLocal(env)) < r.cancelMin) return json({ error: `Faltan menos de ${Math.round(r.cancelMin / 60)} h para tu cita. Llámanos para cancelarla.` }, 409);
  await env.DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?1 AND status = 'booked'").bind(b.id).run();
  ctx.waitUntil(alertOwner(env, `Cita cancelada: ${b.name} · ${fmtDate(b.start_at)}`, `${b.service_name}. Tel. ${b.phone}`, true).catch(() => {}));
  return json({ ok: true });
}

/* ------------------------------------------------------------------ recordatorios (Cron) */
async function sendReminders(env) {
  const now = nowLocal(env);
  // 24 h antes: citas entre dentro de 2 h y dentro de 25 h aún sin recordatorio de 24 h
  const due24 = await env.DB.prepare(
    `SELECT b.id, b.code, b.name, b.email, b.service_name, b.price_cents, b.start_at, br.name AS barber_name FROM bookings b JOIN barbers br ON br.id = b.barber_id
     WHERE b.status = 'booked' AND b.r24 = 0 AND b.email IS NOT NULL AND b.email != '' AND b.start_at > ?1 AND b.start_at <= ?2`
  ).bind(addMin(now, 120), addMin(now, 25 * 60)).all();
  for (const b of due24.results) {
    const claimed = await env.DB.prepare("UPDATE bookings SET r24 = 1 WHERE id = ?1 AND r24 = 0").bind(b.id).run();
    if (claimed.meta.changes) await mailReminder(env, b, "Mañana tienes cita", env.SITE_URL || "");
  }
  // 2 h antes
  const due2 = await env.DB.prepare(
    `SELECT b.id, b.code, b.name, b.email, b.service_name, b.price_cents, b.start_at, br.name AS barber_name FROM bookings b JOIN barbers br ON br.id = b.barber_id
     WHERE b.status = 'booked' AND b.r2 = 0 AND b.email IS NOT NULL AND b.email != '' AND b.start_at > ?1 AND b.start_at <= ?2`
  ).bind(now, addMin(now, 135)).all();
  for (const b of due2.results) {
    const claimed = await env.DB.prepare("UPDATE bookings SET r2 = 1, r24 = 1 WHERE id = ?1 AND r2 = 0").bind(b.id).run();
    if (claimed.meta.changes) await mailReminder(env, b, "Tu cita es en un par de horas", env.SITE_URL || "");
  }
  await env.DB.prepare("DELETE FROM auth_attempts WHERE ts < ?1").bind(Math.floor(Date.now() / 1000) - 86400).run();
  return due24.results.length + due2.results.length;
}

/* ------------------------------------------------------------------ cuentas */
async function hashPassword(password, saltHex, iter) {
  const key = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations: iter }, key, 256));
}
const iterations = (env) => Math.min(100000, Math.max(1000, Number(env.PBKDF2_ITER) || 100000));
function getCookie(request, name) {
  const h = request.headers.get("cookie") || "";
  for (const part of h.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return "";
}
const sessionCookie = (value, maxAge) => `sid=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
async function startSession(env, userId) {
  const tok = randomHex(32);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, datetime('now', ?3))").bind(await sha256(tok), userId, `+${SESSION_DAYS} days`).run();
  return tok;
}
async function tooMany(env, keys, max = MAX_ATTEMPTS) {
  const since = Math.floor(Date.now() / 1000) - ATTEMPT_WINDOW_MIN * 60;
  for (const k of keys) {
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE k = ?1 AND ts > ?2").bind(k, since).first();
    if (r && r.n >= max) return true;
  }
  return false;
}
async function hit(env, keys) {
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch(keys.map((k) => env.DB.prepare("INSERT INTO auth_attempts (k, ts) VALUES (?1, ?2)").bind(k, now)));
}
const TOO_MANY = () => json({ error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." }, 429);
const newRefCode = () => randomHex(4).toUpperCase();

async function addPoints(env, userId, delta, reason) {
  await env.DB.prepare("INSERT INTO points (user_id, delta, reason) VALUES (?1, ?2, ?3)").bind(userId, delta, reason).run();
}
async function pointsBalance(env, userId) {
  const r = await env.DB.prepare("SELECT COALESCE(SUM(delta), 0) AS p FROM points WHERE user_id = ?1").bind(userId).first();
  return r.p;
}

async function auth(request, env, url, ctx) {
  const route = url.pathname.slice("/api/auth/".length);
  if (request.method !== "POST") return json({ error: "No encontrado" }, 404);
  if (!sameOrigin(request, url)) return json({ error: "Origen no permitido." }, 403);
  const body = await getJson(request);
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const origin = publicOrigin(env, request);

  if (route === "register") {
    const email = cleanEmail(body.email), name = cleanName(body.name), password = String(body.password || "");
    const phone = body.phone ? cleanPhone(body.phone) : "";
    if (!EMAIL_RE.test(email)) return json({ error: "Escribe un correo válido." }, 400);
    if (!name) return json({ error: "Escribe tu nombre." }, 400);
    if (body.phone && !phone) return json({ error: "El teléfono no es válido." }, 400);
    if (password.length < 8 || password.length > 128) return json({ error: "La contraseña debe tener entre 8 y 128 caracteres." }, 400);
    if (body.terms !== true) return json({ error: "Debes aceptar la política de privacidad." }, 400);
    if (await tooMany(env, [`reg:ip:${ip}`])) return TOO_MANY();
    await hit(env, [`reg:ip:${ip}`]);
    if (await env.DB.prepare("SELECT id FROM users WHERE email = ?1").bind(email).first()) return json({ error: "Ese correo ya tiene cuenta. Prueba a iniciar sesión." }, 409);
    const refBy = body.ref ? await env.DB.prepare("SELECT id FROM users WHERE ref_code = ?1").bind(String(body.ref).toUpperCase().slice(0, 8)).first() : null;
    const salt = randomHex(16), iter = iterations(env), marketing = body.marketing === true ? 1 : 0;
    const hash = await hashPassword(password, salt, iter);
    const rc = newRefCode();
    const r = await env.DB.prepare(
      "INSERT INTO users (email, name, phone, pass_hash, pass_salt, pass_iter, marketing, marketing_at, terms_at, ref_code, referred_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CASE WHEN ?7 = 1 THEN datetime('now') END, datetime('now'), ?8, ?9)"
    ).bind(email, name, phone || null, hash, salt, iter, marketing, rc, refBy ? refBy.id : null).run();
    const uid = r.meta.last_row_id;
    const rl = await rules(env);
    if (rl.welcomePoints > 0) await addPoints(env, uid, rl.welcomePoints, "Bienvenida al club");
    // Reservas anteriores hechas con ese correo pasan a la cuenta
    await env.DB.prepare("UPDATE bookings SET user_id = ?1 WHERE user_id IS NULL AND email = ?2").bind(uid, email).run();
    ctx.waitUntil(Promise.all([mailWelcome(env, email, name, origin, rl.welcomePoints), marketing ? brevoSubscribe(env, email, name, true) : Promise.resolve()]).catch((e) => console.error("mail", e && e.message)));
    const tok = await startSession(env, uid);
    const res = json({ user: { email, name } }, 201);
    res.headers.append("set-cookie", sessionCookie(tok, SESSION_DAYS * 86400));
    return res;
  }

  if (route === "login") {
    const email = cleanEmail(body.email), password = String(body.password || "");
    const keys = [`login:ip:${ip}`, `login:em:${email}`];
    if (await tooMany(env, keys)) return TOO_MANY();
    const u = await env.DB.prepare("SELECT id, name, email, pass_hash, pass_salt, pass_iter FROM users WHERE email = ?1").bind(email).first();
    const calc = await hashPassword(password.slice(0, 128), u ? u.pass_salt : "00".repeat(16), u ? u.pass_iter : iterations(env));
    if (!u || !safeEqual(calc, u.pass_hash)) { await hit(env, keys); return json({ error: "Correo o contraseña incorrectos." }, 401); }
    const tok = await startSession(env, u.id);
    const res = json({ user: { email: u.email, name: u.name } });
    res.headers.append("set-cookie", sessionCookie(tok, SESSION_DAYS * 86400));
    return res;
  }

  if (route === "logout") {
    const tok = getCookie(request, "sid");
    if (/^[0-9a-f]{64}$/.test(tok)) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(await sha256(tok)).run();
    const res = json({ ok: true });
    res.headers.append("set-cookie", sessionCookie("", 0));
    return res;
  }

  if (route === "forgot") {
    const email = cleanEmail(body.email);
    const keys = [`forgot:ip:${ip}`, `forgot:em:${email}`];
    if (await tooMany(env, keys)) return TOO_MANY();
    await hit(env, keys);
    const u = EMAIL_RE.test(email) ? await env.DB.prepare("SELECT id, name, email FROM users WHERE email = ?1").bind(email).first() : null;
    if (u) {
      const tok = randomHex(32);
      await env.DB.prepare("INSERT INTO resets (token_hash, user_id, expires_at) VALUES (?1, ?2, datetime('now', '+1 hour'))").bind(await sha256(tok), u.id).run();
      ctx.waitUntil(mailReset(env, u.email, u.name, `${origin}/?reset=${tok}`).catch((e) => console.error("mail", e && e.message)));
    }
    return json({ ok: true });
  }

  if (route === "reset") {
    const tok = String(body.token || ""), password = String(body.password || "");
    if (!/^[0-9a-f]{64}$/.test(tok)) return json({ error: "El enlace no es válido o ha caducado." }, 400);
    if (password.length < 8 || password.length > 128) return json({ error: "La contraseña debe tener entre 8 y 128 caracteres." }, 400);
    if (await tooMany(env, [`reset:ip:${ip}`])) return TOO_MANY();
    const th = await sha256(tok);
    const r = await env.DB.prepare("SELECT user_id FROM resets WHERE token_hash = ?1 AND used = 0 AND expires_at > datetime('now')").bind(th).first();
    if (!r) { await hit(env, [`reset:ip:${ip}`]); return json({ error: "El enlace no es válido o ha caducado." }, 400); }
    const salt = randomHex(16), iter = iterations(env), hash = await hashPassword(password, salt, iter);
    await env.DB.batch([
      env.DB.prepare("UPDATE users SET pass_hash = ?1, pass_salt = ?2, pass_iter = ?3 WHERE id = ?4").bind(hash, salt, iter, r.user_id),
      env.DB.prepare("UPDATE resets SET used = 1 WHERE token_hash = ?1").bind(th),
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(r.user_id),
    ]);
    return json({ ok: true });
  }

  const user = await currentUser(request, env);
  if (!user) return json({ error: "Inicia sesión para continuar." }, 401);

  if (route === "marketing") {
    const on = body.marketing === true ? 1 : 0;
    await env.DB.prepare("UPDATE users SET marketing = ?1, marketing_at = datetime('now') WHERE id = ?2").bind(on, user.id).run();
    ctx.waitUntil(brevoSubscribe(env, user.email, user.name, !!on).catch((e) => console.error("brevo", e && e.message)));
    return json({ ok: true, marketing: !!on });
  }

  if (route === "delete") {
    const u = await env.DB.prepare("SELECT pass_hash, pass_salt, pass_iter FROM users WHERE id = ?1").bind(user.id).first();
    if (await tooMany(env, [`del:u:${user.id}`])) return TOO_MANY();
    const calc = await hashPassword(String(body.password || "").slice(0, 128), u.pass_salt, u.pass_iter);
    if (!safeEqual(calc, u.pass_hash)) { await hit(env, [`del:u:${user.id}`]); return json({ error: "Contraseña incorrecta." }, 401); }
    // Se borran la cuenta, los puntos y las sesiones; las citas quedan sin cuenta (ON DELETE SET NULL)
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(user.id),
      env.DB.prepare("DELETE FROM resets WHERE user_id = ?1").bind(user.id),
      env.DB.prepare("DELETE FROM users WHERE id = ?1").bind(user.id),
    ]);
    ctx.waitUntil(brevoSubscribe(env, user.email, user.name, false).catch((e) => console.error("brevo", e && e.message)));
    const res = json({ ok: true });
    res.headers.append("set-cookie", sessionCookie("", 0));
    return res;
  }
  return json({ error: "No encontrado" }, 404);
}

async function me(request, env) {
  const user = await currentUser(request, env);
  if (!user) return json({ user: null });
  const now = nowLocal(env);
  const [upcoming, past, ledger, reds, balance] = await Promise.all([
    env.DB.prepare(`SELECT b.code, b.service_name, b.price_cents, b.start_at, br.name AS barber FROM bookings b JOIN barbers br ON br.id = b.barber_id WHERE b.user_id = ?1 AND b.status = 'booked' AND b.start_at >= ?2 ORDER BY b.start_at LIMIT 10`).bind(user.id, now).all(),
    env.DB.prepare(`SELECT b.service_name, b.price_cents, b.start_at, b.status FROM bookings b WHERE b.user_id = ?1 AND (b.start_at < ?2 OR b.status != 'booked') ORDER BY b.start_at DESC LIMIT 10`).bind(user.id, now).all(),
    env.DB.prepare("SELECT delta, reason, created_at FROM points WHERE user_id = ?1 ORDER BY id DESC LIMIT 15").bind(user.id).all(),
    env.DB.prepare("SELECT reward_name, code, status, created_at FROM redemptions WHERE user_id = ?1 ORDER BY id DESC LIMIT 10").bind(user.id).all(),
    pointsBalance(env, user.id),
  ]);
  const rl = await rules(env);
  return json({
    user: { name: user.name, email: user.email, phone: user.phone || "", marketing: !!user.marketing, refCode: user.ref_code },
    points: balance, upcoming: upcoming.results.map((b) => ({ ...b, whenText: fmtDate(b.start_at) })), past: past.results, ledger: ledger.results, redemptions: reds.results,
    referralPoints: rl.referralPoints,
  });
}

async function redeem(request, env, url) {
  if (!sameOrigin(request, url)) return json({ error: "Origen no permitido." }, 403);
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Inicia sesión para continuar." }, 401);
  const body = await getJson(request);
  const rw = await env.DB.prepare("SELECT id, name, cost FROM rewards WHERE id = ?1 AND active = 1").bind(Number(body.rewardId)).first();
  if (!rw) return json({ error: "Premio no disponible." }, 404);
  const code = randomHex(3).toUpperCase();
  // Descuento y canje en un solo paso: solo se canjea si el saldo alcanza (no puede quedar negativo)
  const r = await env.DB.prepare(
    `INSERT INTO points (user_id, delta, reason) SELECT ?1, ?2, ?3 WHERE (SELECT COALESCE(SUM(delta), 0) FROM points WHERE user_id = ?1) >= ?4`
  ).bind(user.id, -rw.cost, "Canje: " + rw.name, rw.cost).run();
  if (r.meta.changes !== 1) return json({ error: "Aún no tienes puntos suficientes." }, 409);
  await env.DB.prepare("INSERT INTO redemptions (user_id, reward_id, reward_name, cost, code) VALUES (?1, ?2, ?3, ?4, ?5)").bind(user.id, rw.id, rw.name, rw.cost, code).run();
  return json({ ok: true, code, reward: rw.name, points: await pointsBalance(env, user.id) });
}

/* ------------------------------------------------------------------ probador con IA (desactivado por defecto: cuesta dinero por uso) */
const tryonEnabled = (env) => env.TRYON === "1" && !!env.FAL_KEY;
const TRYON_MODEL = "fal-ai/flux-pro/kontext"; // edición de imagen: cambia solo el peinado
const TRYON_MAX_B64 = 1_600_000;              // ~1,2 MB de imagen ya reducida en el navegador
async function tryon(request, env, url) {
  if (!sameOrigin(request, url)) return json({ error: "Origen no permitido." }, 403);
  if (!tryonEnabled(env)) return json({ error: "El probador con IA aún no está activado." }, 503);
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Inicia sesión para usar el probador." }, 401);
  const body = await getJson(request);
  if (body.consent !== true) return json({ error: "Debes aceptar el envío de tu foto al proveedor de IA." }, 400);
  const image = String(body.image || "");
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > TRYON_MAX_B64) return json({ error: "La foto no es válida o es demasiado grande." }, 400);
  // El texto del peinado lo fija el servidor (nombre de catálogo recortado y limpio): nadie puede inyectar instrucciones libres
  const cut = String(body.cut || "").replace(/[^\p{L}\p{N} +\-/()]/gu, "").trim().slice(0, 60);
  if (!cut) return json({ error: "Elige un corte." }, 400);
  const day = nowLocal(env).slice(0, 10);
  const perUser = Number(env.TRYON_DAILY) || 2, global = Number(env.TRYON_GLOBAL_DAILY) || 30;
  const mine = await env.DB.prepare("SELECT COUNT(*) AS n FROM tryon_log WHERE user_id = ?1 AND day = ?2").bind(user.id, day).first();
  if (mine.n >= perUser) return json({ error: `Hoy ya has usado tus ${perUser} pruebas. Vuelve mañana.` }, 429);
  const all = await env.DB.prepare("SELECT COUNT(*) AS n FROM tryon_log WHERE day = ?1").bind(day).first();
  if (all.n >= global) return json({ error: "Hoy hemos agotado las pruebas disponibles. Inténtalo mañana." }, 429);
  // Se reserva el uso ANTES de llamar a la IA (así un fallo no permite reintentos ilimitados que cuesten dinero)
  await env.DB.prepare("INSERT INTO tryon_log (user_id, day) VALUES (?1, ?2)").bind(user.id, day).run();
  const prompt = `Change only the hairstyle of the person to: ${cut}. Keep the same face, identity, skin tone, expression, clothes, lighting and background. Realistic barbershop photo, natural hair texture.`;
  const res = await fetch("https://fal.run/" + TRYON_MODEL, {
    method: "POST", headers: { authorization: "Key " + env.FAL_KEY, "content-type": "application/json" },
    body: JSON.stringify({ prompt, image_url: image, num_images: 1, output_format: "jpeg", safety_tolerance: "2" }),
  });
  if (!res.ok) { console.error("fal", res.status, (await res.text().catch(() => "")).slice(0, 200)); return json({ error: "No se ha podido generar la imagen. Inténtalo más tarde." }, 502); }
  const out = await res.json().catch(() => ({}));
  const img = out && out.images && out.images[0] && out.images[0].url;
  if (!img || !/^https:\/\//.test(img)) return json({ error: "La IA no devolvió ninguna imagen." }, 502);
  return json({ ok: true, url: img });
}

/* ------------------------------------------------------------------ administración */
async function admin(request, env, url, ctx) {
  const route = url.pathname.slice("/api/admin/".length);
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  if (!env.ADMIN_TOKEN) return json({ error: "Panel no configurado." }, 503);
  if (await tooMany(env, [`admin:ip:${ip}`])) return TOO_MANY();
  if (!safeEqual(request.headers.get("x-admin-token") || "", env.ADMIN_TOKEN)) {
    await hit(env, [`admin:ip:${ip}`]);
    return json({ error: "No autorizado" }, 401);
  }
  const post = request.method === "POST";
  if (post && !sameOrigin(request, url)) return json({ error: "Origen no permitido." }, 403);
  const body = post ? await getJson(request) : {};
  const q = url.searchParams;

  if (route === "agenda" && !post) {
    const date = DATE_RE.test(q.get("date") || "") ? q.get("date") : nowLocal(env).slice(0, 10);
    const [bk, bl] = await Promise.all([
      env.DB.prepare(`SELECT b.id, b.code, b.name, b.phone, b.email, b.service_name, b.price_cents, b.start_at, b.end_at, b.status, b.source, b.note, b.user_id, br.name AS barber FROM bookings b JOIN barbers br ON br.id = b.barber_id WHERE b.start_at >= ?1 AND b.start_at < ?2 ORDER BY b.start_at`).bind(date + " 00:00", addDays(date, 1) + " 00:00").all(),
      env.DB.prepare("SELECT id, barber_id, start_at, end_at, note FROM blocks WHERE start_at < ?2 AND end_at > ?1 ORDER BY start_at").bind(date + " 00:00", addDays(date, 1) + " 00:00").all(),
    ]);
    return json({ date, bookings: bk.results, blocks: bl.results });
  }
  if (route === "status" && post) {
    const id = Number(body.id), status = String(body.status);
    if (!Number.isInteger(id) || !["booked", "done", "noshow", "cancelled"].includes(status)) return json({ error: "Datos no válidos" }, 400);
    const b = await env.DB.prepare("SELECT id, user_id, price_cents, points_done, status FROM bookings WHERE id = ?1").bind(id).first();
    if (!b) return json({ error: "Cita no encontrada" }, 404);
    await env.DB.prepare("UPDATE bookings SET status = ?1 WHERE id = ?2").bind(status, id).run();
    // Puntos del club: se dan una sola vez al marcar la cita como realizada
    if (status === "done" && b.user_id && !b.points_done) {
      const claimed = await env.DB.prepare("UPDATE bookings SET points_done = 1 WHERE id = ?1 AND points_done = 0").bind(id).run();
      if (claimed.meta.changes) {
        const rl = await rules(env);
        const pts = Math.floor((b.price_cents / 100) * rl.pointsPerEuro);
        if (pts > 0) await addPoints(env, b.user_id, pts, "Cita realizada");
        const u = await env.DB.prepare("SELECT referred_by, ref_paid FROM users WHERE id = ?1").bind(b.user_id).first();
        if (u && u.referred_by && !u.ref_paid && rl.referralPoints > 0) {
          await env.DB.prepare("UPDATE users SET ref_paid = 1 WHERE id = ?1").bind(b.user_id).run();
          await addPoints(env, b.user_id, rl.referralPoints, "Premio por venir recomendado");
          await addPoints(env, u.referred_by, rl.referralPoints, "Un amigo tuyo ha hecho su primera cita");
        }
      }
    }
    return json({ ok: true });
  }
  if (route === "book" && post) {
    const name = cleanName(body.name), phone = cleanPhone(body.phone), serviceId = Number(body.service), barberId = Number(body.barber), start = String(body.start || "");
    if (!name || !phone || !DT_RE.test(start)) return json({ error: "Faltan datos: nombre, teléfono y hora." }, 400);
    const service = await env.DB.prepare("SELECT id, name, minutes, price_cents FROM services WHERE id = ?1").bind(serviceId).first();
    const barber = await env.DB.prepare("SELECT id, name FROM barbers WHERE id = ?1").bind(barberId).first();
    if (!service || !barber) return json({ error: "Servicio o barbero no válidos." }, 400);
    const email = cleanEmail(body.email);
    const ok = await insertBooking(env, { code: randomHex(12), user_id: null, name, phone, email: EMAIL_RE.test(email) ? email : "", service_id: service.id, service_name: service.name, price_cents: service.price_cents, barber_id: barber.id, start_at: start, end_at: addMin(start, service.minutes), source: "mostrador" });
    return ok ? json({ ok: true }, 201) : json({ error: "Ese hueco está ocupado o bloqueado." }, 409);
  }
  if (route === "block" && post) {
    const start = String(body.start || ""), end = String(body.end || "");
    if (!DT_RE.test(start) || !DT_RE.test(end) || end <= start) return json({ error: "Fechas no válidas" }, 400);
    await env.DB.prepare("INSERT INTO blocks (barber_id, start_at, end_at, note) VALUES (?1, ?2, ?3, ?4)").bind(Number(body.barber) || null, start, end, String(body.note || "").slice(0, 80)).run();
    return json({ ok: true }, 201);
  }
  if (route === "unblock" && post) {
    await env.DB.prepare("DELETE FROM blocks WHERE id = ?1").bind(Number(body.id)).run();
    return json({ ok: true });
  }
  if (route === "clients" && !post) {
    const term = "%" + String(q.get("q") || "").replace(/[%_]/g, "").slice(0, 40) + "%";
    const { results } = await env.DB.prepare(
      `SELECT u.id, u.name, u.email, u.phone, u.created_at, COALESCE((SELECT SUM(delta) FROM points WHERE user_id = u.id), 0) AS points,
        (SELECT COUNT(*) FROM bookings WHERE user_id = u.id AND status = 'done') AS visits,
        (SELECT COUNT(*) FROM bookings WHERE user_id = u.id AND status = 'noshow') AS noshows
       FROM users u WHERE u.name LIKE ?1 OR u.email LIKE ?1 OR u.phone LIKE ?1 ORDER BY u.id DESC LIMIT 100`
    ).bind(term).all();
    return json({ clients: results });
  }
  if (route === "points" && post) {
    const uid = Number(body.userId), delta = Math.trunc(Number(body.delta));
    if (!Number.isInteger(uid) || !delta || Math.abs(delta) > 10000) return json({ error: "Datos no válidos" }, 400);
    await addPoints(env, uid, delta, String(body.reason || "Ajuste del local").slice(0, 80));
    return json({ ok: true });
  }
  if (route === "redemptions" && !post) {
    const { results } = await env.DB.prepare(`SELECT r.id, r.code, r.reward_name, r.status, r.created_at, u.name, u.phone FROM redemptions r JOIN users u ON u.id = r.user_id ORDER BY r.status, r.id DESC LIMIT 100`).all();
    return json({ redemptions: results });
  }
  if (route === "redemption-use" && post) {
    await env.DB.prepare("UPDATE redemptions SET status = 'used', used_at = datetime('now') WHERE id = ?1 AND status = 'open'").bind(Number(body.id)).run();
    return json({ ok: true });
  }
  if (route === "reminders" && !post) {
    // Lista para avisar por WhatsApp a quien no dejó correo (o reforzar): citas del día indicado con enlace wa.me
    const date = DATE_RE.test(q.get("date") || "") ? q.get("date") : addDays(nowLocal(env).slice(0, 10), 1);
    const { results } = await env.DB.prepare(`SELECT b.name, b.phone, b.service_name, b.start_at FROM bookings b WHERE b.status = 'booked' AND b.start_at >= ?1 AND b.start_at < ?2 ORDER BY b.start_at`).bind(date + " 00:00", addDays(date, 1) + " 00:00").all();
    return json({
      date, items: results.map((b) => {
        const phone = b.phone.replace(/^\+/, "").replace(/^(\d{9})$/, "34$1");
        const text = `Hola ${b.name.split(" ")[0]}, te recordamos tu cita en ${shopName(env)}: ${fmtDate(b.start_at)} (${b.service_name}). Si no puedes venir, avísanos. ¡Gracias!`;
        return { ...b, link: `https://wa.me/${phone}?text=${encodeURIComponent(text)}` };
      }),
    });
  }
  if (route === "stats" && !post) {
    const today = nowLocal(env).slice(0, 10), from = addDays(today, -29);
    const s = await env.DB.prepare(
      `SELECT COUNT(*) AS total, SUM(status = 'done') AS done, SUM(status = 'noshow') AS noshow, SUM(status = 'cancelled') AS cancelled,
        COALESCE(SUM(CASE WHEN status = 'done' THEN price_cents END), 0) AS revenue FROM bookings WHERE start_at >= ?1 AND start_at < ?2`
    ).bind(from + " 00:00", addDays(today, 1) + " 00:00").first();
    const users = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
    return json({ days: 30, ...s, clients: users.n });
  }
  if (route === "catalog" && !post) {
    const [services, barbers, rewards, hours, r] = await Promise.all([
      env.DB.prepare("SELECT * FROM services ORDER BY sort, id").all(), env.DB.prepare("SELECT * FROM barbers ORDER BY sort, id").all(),
      env.DB.prepare("SELECT * FROM rewards ORDER BY cost").all(), setting(env, "hours", {}), rules(env),
    ]);
    return json({ services: services.results, barbers: barbers.results, rewards: rewards.results, hours, rules: r });
  }
  if (route === "service" && post) {
    const name = cleanName(body.name), minutes = Math.trunc(Number(body.minutes)), price = Math.round(Number(String(body.price).replace(",", ".")) * 100);
    if (!name || !(minutes >= 5 && minutes <= 480) || !(price >= 0 && price < 100000)) return json({ error: "Datos no válidos" }, 400);
    const active = body.active === false ? 0 : 1;
    if (body.id) await env.DB.prepare("UPDATE services SET name = ?1, minutes = ?2, price_cents = ?3, active = ?4 WHERE id = ?5").bind(name, minutes, price, active, Number(body.id)).run();
    else await env.DB.prepare("INSERT INTO services (name, minutes, price_cents, active, sort) VALUES (?1, ?2, ?3, ?4, (SELECT COALESCE(MAX(sort), 0) + 1 FROM services))").bind(name, minutes, price, active).run();
    return json({ ok: true });
  }
  if (route === "barber" && post) {
    const name = cleanName(body.name);
    if (!name) return json({ error: "Escribe un nombre" }, 400);
    const active = body.active === false ? 0 : 1;
    if (body.id) await env.DB.prepare("UPDATE barbers SET name = ?1, active = ?2 WHERE id = ?3").bind(name, active, Number(body.id)).run();
    else await env.DB.prepare("INSERT INTO barbers (name, active, sort) VALUES (?1, ?2, (SELECT COALESCE(MAX(sort), 0) + 1 FROM barbers))").bind(name, active).run();
    return json({ ok: true });
  }
  if (route === "reward" && post) {
    const name = cleanName(body.name), cost = Math.trunc(Number(body.cost));
    if (!name || !(cost > 0 && cost < 100000)) return json({ error: "Datos no válidos" }, 400);
    const active = body.active === false ? 0 : 1;
    if (body.id) await env.DB.prepare("UPDATE rewards SET name = ?1, cost = ?2, active = ?3 WHERE id = ?4").bind(name, cost, active, Number(body.id)).run();
    else await env.DB.prepare("INSERT INTO rewards (name, cost, active) VALUES (?1, ?2, ?3)").bind(name, cost, active).run();
    return json({ ok: true });
  }
  if (route === "hours" && post) {
    const h = body.hours || {}, out = {};
    for (let d = 0; d < 7; d++) {
      const w = Array.isArray(h[d]) ? h[d] : [];
      out[d] = w.filter((x) => Array.isArray(x) && /^\d{2}:\d{2}$/.test(x[0]) && /^\d{2}:\d{2}$/.test(x[1]) && x[0] < x[1]).slice(0, 3).map((x) => [x[0], x[1]]);
    }
    await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('hours', ?1) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(out)).run();
    return json({ ok: true });
  }
  if (route === "rules" && post) {
    const cur = await rules(env), next = { ...cur };
    for (const k of Object.keys(RULES_DEFAULT)) if (body[k] !== undefined && Number.isFinite(Number(body[k])) && Number(body[k]) >= 0) next[k] = Number(body[k]);
    if (![10, 15, 20, 30, 45, 60].includes(next.stepMin)) return json({ error: "El intervalo debe ser 10, 15, 20, 30, 45 o 60 minutos." }, 400);
    await env.DB.prepare("INSERT INTO settings (k, v) VALUES ('rules', ?1) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(next)).run();
    return json({ ok: true });
  }
  return json({ error: "No encontrado" }, 404);
}

/* ------------------------------------------------------------------ correo (Brevo) */
async function alertOwner(env, title, detail, info) {
  try {
    if (!env.OWNER_EMAIL) return;
    const inner = `<p style="font-size:14px;line-height:1.5">${info ? "" : "Se ha producido un problema en la web."}</p><p style="font-size:14px;background:#f6f4f0;padding:10px 12px;border-radius:8px;word-break:break-word">${escHtml(String(detail || "sin detalle").slice(0, 300))}</p>`;
    await sendMail(env, env.OWNER_EMAIL, "", (info ? "" : "⚠️ ") + shopName(env) + ": " + title, layout(env, title, inner));
  } catch (e) { console.error("alertOwner", e && e.message); }
}
async function sendMail(env, to, toName, subject, html) {
  if (!env.BREVO_API_KEY || !env.MAIL_FROM) { console.log("Correo no enviado (falta BREVO_API_KEY o MAIL_FROM):", subject); return false; }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST", headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { name: env.MAIL_FROM_NAME || shopName(env), email: env.MAIL_FROM }, to: [{ email: to, name: toName || undefined }], subject, htmlContent: html }),
  });
  if (!res.ok) console.error("Brevo rechazó el correo:", res.status, (await res.text().catch(() => "")).slice(0, 200));
  return res.ok;
}
function layout(env, title, inner, button) {
  const btn = button ? `<p style="margin:24px 0"><a href="${escHtml(button.url)}" style="background:#C9A24B;color:#111;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px;display:inline-block">${escHtml(button.text)}</a></p>` : "";
  return `<!doctype html><html lang="es"><body style="margin:0;background:#0f0f10;font-family:Arial,Helvetica,sans-serif;color:#141414">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border-radius:16px;padding:28px">
<p style="font-size:16px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;margin:0 0 18px;color:#8a6d27">${escHtml(shopName(env))}</p>
<h1 style="font-size:22px;margin:0 0 12px">${escHtml(title)}</h1>${inner}${btn}
</div><p style="font-size:12px;color:#8d8c88;text-align:center;margin:14px 0 0">${escHtml(shopName(env))}${env.SHOP_ADDRESS ? " · " + escHtml(env.SHOP_ADDRESS) : ""}</p></div></body></html>`;
}
function bookingBlock(b) {
  return `<p style="font-size:15px;line-height:1.6;background:#f6f4f0;padding:14px 16px;border-radius:10px;margin:14px 0"><b>${escHtml(fmtDate(b.start_at))}</b><br>${escHtml(b.service_name)} · ${eur(b.price_cents)}${b.barber_name ? "<br>Con " + escHtml(b.barber_name) : ""}</p>`;
}
function gcal(b) {
  const f = (dt) => dt.replace(/[-: ]/g, "").slice(0, 13) + "00";
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("Cita en Infinity Barber")}&dates=${f(b.start_at)}/${f(addMin(b.start_at, 30))}&ctz=${encodeURIComponent(TZ)}`;
}
function mailBooked(env, b, origin) {
  const cancel = `${origin}/?cita=${b.code}`;
  return sendMail(env, b.email, b.name, `Cita confirmada · ${fmtDate(b.start_at)}`,
    layout(env, `¡Cita confirmada, ${b.name.split(" ")[0]}!`, `${bookingBlock(b)}<p style="font-size:14px;line-height:1.6">¿No puedes venir? Puedes cancelarla o cambiarla desde el botón (hasta 2 horas antes). <a href="${escHtml(gcal(b))}">Añadir a Google Calendar</a>.</p>`, { text: "Ver o cancelar mi cita", url: cancel }));
}
function mailReminder(env, b, title, origin) {
  const link = origin ? `${origin}/?cita=${b.code}` : "";
  return sendMail(env, b.email, b.name, `${title} · ${fmtDate(b.start_at)}`,
    layout(env, `${title}, ${b.name.split(" ")[0]}`, `${bookingBlock(b)}<p style="font-size:14px;line-height:1.6">Si no puedes venir, avísanos para dar el hueco a otra persona.</p>`, link ? { text: "Ver o cancelar mi cita", url: link } : undefined));
}
function mailWelcome(env, email, name, origin, pts) {
  return sendMail(env, email, name, `Bienvenido/a al club de ${shopName(env)}`,
    layout(env, `¡Hola, ${name}!`, `<p style="font-size:15px;line-height:1.5">Tu cuenta está creada${pts ? ` y ya tienes <b>${pts} puntos</b> de bienvenida` : ""}. Cada cita que hagas suma puntos para conseguir premios.</p>`, { text: "Reservar cita", url: origin }));
}
function mailReset(env, email, name, link) {
  return sendMail(env, email, name, "Restablece tu contraseña",
    layout(env, "Restablece tu contraseña", `<p style="font-size:15px;line-height:1.5">Hola ${escHtml(name)}, pulsa el botón para elegir una contraseña nueva. El enlace funciona una sola vez y caduca en 1 hora.</p><p style="font-size:13px;color:#6b6a66">Si no lo has pedido tú, ignora este correo.</p>`, { text: "Elegir nueva contraseña", url: link }));
}
async function brevoSubscribe(env, email, name, subscribe) {
  if (!env.BREVO_API_KEY) return;
  const headers = { "api-key": env.BREVO_API_KEY, "content-type": "application/json", accept: "application/json" };
  if (subscribe) {
    const listIds = env.BREVO_LIST_ID ? [Number(env.BREVO_LIST_ID)] : undefined;
    await fetch("https://api.brevo.com/v3/contacts", { method: "POST", headers, body: JSON.stringify({ email, attributes: { FIRSTNAME: name }, listIds, updateEnabled: true }) });
  } else {
    await fetch("https://api.brevo.com/v3/contacts/" + encodeURIComponent(email), { method: "PUT", headers, body: JSON.stringify({ emailBlacklisted: true }) });
  }
}
