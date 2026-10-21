/* app.js · reservas reales, cuenta, club de puntos (Barbería). Sin librerías. */
(function () {
"use strict";
var $ = function (s, r) { return (r || document).querySelector(s); };
var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
var eur = function (c) { return (c / 100).toFixed(2).replace(".", ",").replace(",00", "") + " €"; };
var CFG = null, USER = null;

function api(method, path, body) {
  return fetch(path, { method: method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined })
    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || "Error"); e.status = r.status; throw e; } return j; }); });
}
function msg(el, text, kind) { if (!el) return; el.textContent = text || ""; el.className = "bx-msg" + (kind ? " " + kind : ""); }
function openLegal(e) { e.preventDefault(); var d = document.getElementById("dlg-privacidad"); if (d && d.showModal) { d.showModal(); } }

/* ---------------------------------------------------------------- fechas (Madrid) */
function todayLocal() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
}
function addDays(d, n) { var o = new Date(d + "T00:00:00Z"); o.setUTCDate(o.getUTCDate() + n); return o.toISOString().slice(0, 10); }
var DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
function dow(d) { return new Date(d + "T00:00:00Z").getUTCDay(); }

/* ---------------------------------------------------------------- RESERVA */
var S = { service: null, barber: 0, date: null, time: null, slots: [], busy: false };
var root;

function initBooking() {
  var old = $("#reservas form");
  if (!old) return;
  root = document.createElement("div");
  root.className = "bk space-y-4";
  root.id = "bk-app";
  old.parentNode.insertBefore(root, old);
  old.hidden = true;
  var intro = $("#reservas .text-mute");
  if (intro) intro.textContent = "Elige servicio, barbero, día y hora. Te llega la confirmación y un recordatorio por correo, y puedes cancelar desde el enlace.";
  S.service = CFG.services[0] ? CFG.services[0].id : null;
  S.date = null;
  renderBooking();
  // El botón "Elegir" de la tarjeta de cada servicio preselecciona ese servicio
  document.querySelectorAll("[data-elegir]").forEach(function (b) {
    b.addEventListener("click", function () {
      var key = b.dataset.elegir, map = { corte: /^corte de pelo/i, fade: /degrad|fade/i, barba: /^arreglo/i, combo: /corte \+ barba/i, trat: /tratamiento/i };
      var s = CFG.services.filter(function (x) { return map[key] && map[key].test(x.name); })[0];
      if (s) { S.service = s.id; S.time = null; renderBooking(); loadSlots(); }
    });
  });
  preselectFromHash();
  loadSlots();
}

function preselectFromHash() {
  var p = new URLSearchParams(location.search), corte = p.get("corte");
  if (corte) { S.note = corte; }
}

function renderBooking() {
  var svc = CFG.services.map(function (s) {
    return '<label><input type="radio" name="bk-svc" value="' + s.id + '"' + (s.id === S.service ? " checked" : "") + '><b>' + esc(s.name) + '<small> · ' + s.minutes + ' min</small></b><em>' + eur(s.price_cents) + "</em></label>";
  }).join("");
  var barbers = '<button type="button" class="bx-chip" data-b="0" aria-pressed="' + (S.barber === 0) + '">Cualquiera</button>' + CFG.barbers.map(function (b) { return '<button type="button" class="bx-chip" data-b="' + b.id + '" aria-pressed="' + (S.barber === b.id) + '">' + esc(b.name) + "</button>"; }).join("");
  var today = todayLocal(), days = "";
  for (var i = 0; i <= Math.min(CFG.rules.maxDays, 20); i++) {
    var d = addDays(today, i), open = (CFG.hours[String(dow(d))] || []).length > 0;
    days += '<button type="button" class="bk-day" data-d="' + d + '"' + (open ? "" : " disabled") + ' aria-pressed="' + (S.date === d) + '" aria-label="' + esc(DOW[dow(d)] + " " + d.slice(8)) + '"><span>' + (i === 0 ? "hoy" : DOW[dow(d)]) + "</span><b>" + Number(d.slice(8)) + "</b></button>";
  }
  var u = USER || {};
  root.innerHTML =
    "<h3>1 · Servicio</h3><div class='bk-svc' role='radiogroup' aria-label='Servicio'>" + svc + "</div>" +
    "<h3>2 · Barbero</h3><div class='bk-row' role='group' aria-label='Barbero'>" + barbers + "</div>" +
    "<h3>3 · Día</h3><div class='bk-days' role='group' aria-label='Día'>" + days + "</div>" +
    "<h3>4 · Hora</h3><div id='bk-slots' class='bk-slots' aria-live='polite'></div><p id='bk-slotmsg' class='bx-msg'></p>" +
    "<div id='bk-form' hidden><h3>5 · Tus datos</h3>" +
    "<label class='bx-lab' for='bk-name' style='margin-top:0'>Nombre</label><input id='bk-name' class='bx-in' autocomplete='given-name' maxlength='60' value='" + esc(u.name || "") + "'>" +
    "<label class='bx-lab' for='bk-phone'>Teléfono</label><input id='bk-phone' class='bx-in' type='tel' inputmode='tel' autocomplete='tel' maxlength='20' value='" + esc(u.phone || "") + "'>" +
    "<label class='bx-lab' for='bk-email'>Correo <span class='bx-small'>(para confirmación y recordatorio)</span></label><input id='bk-email' class='bx-in' type='email' autocomplete='email' maxlength='120' value='" + esc(u.email || "") + "'>" +
    "<div id='bk-pay'></div>" +
    "<label class='bk-terms'><input id='bk-terms' type='checkbox'><span>He leído y acepto la <a href='#privacidad' data-legal-link>Política de Privacidad</a>. Usaremos tus datos solo para gestionar la cita.</span></label>" +
    "<div id='bk-sum' class='bk-sum'></div>" +
    "<p id='bk-cutnote' class='bx-small' " + (S.note ? "" : "hidden") + ">" + (S.note ? "Corte elegido: " + esc(S.note) : "") + "</p><p id='bk-msg' class='bx-msg' role='status' aria-live='polite'></p>" +
    "<button type='button' id='bk-go' class='bx-btn' style='width:100%;min-height:54px'>Confirmar cita</button>" +
    (USER ? "" : "<p class='bx-small' style='text-align:center;margin-top:.7rem'>¿Ya eres del club? <button type='button' class='cx-link' data-open-account>Inicia sesión</button> y suma puntos con cada cita.</p>") +
    "</div>";
  root.querySelectorAll("[name=bk-svc]").forEach(function (r) { r.addEventListener("change", function () { S.service = Number(r.value); S.time = null; loadSlots(); }); });
  root.querySelectorAll("[data-b]").forEach(function (b) {
    b.addEventListener("click", function () {
      S.barber = Number(b.dataset.b); S.time = null;
      root.querySelectorAll("[data-b]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      loadSlots();
    });
  });
  root.querySelectorAll("[data-d]").forEach(function (b) {
    b.addEventListener("click", function () {
      S.date = b.dataset.d; S.time = null;
      root.querySelectorAll("[data-d]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      loadSlots();
    });
  });
  var lg = $("[data-legal-link]", root); if (lg) lg.addEventListener("click", openLegal);
  var oa = $("[data-open-account]", root); if (oa) oa.addEventListener("click", function () { openAccount(); });
  var go = $("#bk-go", root); if (go) go.addEventListener("click", submitBooking);
  if (!S.date) { var first = $("[data-d]:not([disabled])", root); if (first) { S.date = first.dataset.d; first.setAttribute("aria-pressed", "true"); } }
  var form = $("#bk-form", root); if (form && S.time) { form.hidden = false; updateSummary(); }
}

function loadSlots() {
  var box = $("#bk-slots", root), m = $("#bk-slotmsg", root);
  if (!box || !S.date || !S.service) { return; }
  box.innerHTML = ""; msg(m, "Buscando huecos…");
  var date = S.date, svc = S.service, bar = S.barber;
  api("GET", "/api/availability?date=" + date + "&service=" + svc + "&barber=" + bar).then(function (r) {
    if (date !== S.date || svc !== S.service || bar !== S.barber) return;
    S.slots = r.slots || [];
    if (!S.slots.length) { msg(m, "No quedan huecos ese día. Prueba otro día, o apúntate a la lista de espera y te avisamos por correo si se libera uno."); waitForm(box, date, svc, bar); return; }
    msg(m, "");
    box.innerHTML = S.slots.map(function (s) { return '<button type="button" class="bx-chip" data-t="' + s.time + '" aria-pressed="' + (S.time === s.time) + '">' + s.time + "</button>"; }).join("");
    box.querySelectorAll("[data-t]").forEach(function (b) {
      b.addEventListener("click", function () {
        S.time = b.dataset.t;
        box.querySelectorAll("[data-t]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        var f = $("#bk-form", root); f.hidden = false; updateSummary();
        f.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    });
  }).catch(function (e) { msg(m, e.message || "No se pudieron cargar los huecos.", "err"); });
}

// Lista de espera: si el día está lleno, el cliente deja sus datos y la web le escribe cuando se libera un hueco
function waitForm(box, day, svc, bar) {
  var u = USER || {};
  box.innerHTML = "<form id='wl-f' class='bx-wait' novalidate><b>Avísame si se libera un hueco</b>" +
    "<label class='bx-lab' for='wl-name'>Nombre</label><input id='wl-name' class='bx-in' autocomplete='given-name' maxlength='60' value='" + esc(u.name || "") + "'>" +
    "<label class='bx-lab' for='wl-phone'>Teléfono</label><input id='wl-phone' class='bx-in' type='tel' inputmode='tel' autocomplete='tel' maxlength='20' value='" + esc(u.phone || "") + "'>" +
    "<label class='bx-lab' for='wl-email'>Correo <span class='bx-small'>(te avisamos aquí)</span></label><input id='wl-email' class='bx-in' type='email' autocomplete='email' maxlength='120' value='" + esc(u.email || "") + "'>" +
    "<p id='wl-m' class='bx-msg' role='status'></p><button class='bx-ghost' style='width:100%'>Apuntarme a la lista de espera</button></form>";
  var f = $("#wl-f", box), m = $("#wl-m", box);
  f.addEventListener("submit", function (e) {
    e.preventDefault();
    var body = { name: $("#wl-name", f).value.trim(), phone: $("#wl-phone", f).value.trim(), email: $("#wl-email", f).value.trim(), day: day, service: svc, barber: bar || 0 };
    if (!body.name || !body.phone || !body.email) { msg(m, "Rellena nombre, teléfono y correo.", "err"); return; }
    msg(m, "Apuntándote…");
    api("POST", "/api/waitlist", body).then(function () {
      f.innerHTML = "<b>¡Listo, estás en la lista!</b><p class='bx-small'>Si alguien cancela, te escribimos al correo con los huecos. Se los damos al primero que reserve.</p>";
    }).catch(function (e2) {
      msg(m, e2.message, "err");
      if (e2.message && /hay huecos libres/.test(e2.message)) loadSlots();
    });
  });
}

function updateSummary() {
  var s = CFG.services.filter(function (x) { return x.id === S.service; })[0], b = CFG.barbers.filter(function (x) { return x.id === S.barber; })[0];
  var el = $("#bk-sum", root); if (!el || !s) return;
  renderPay();
  var d = new Date(S.date + "T00:00:00Z");
  var txt = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(d);
  el.innerHTML = "<b>" + esc(s.name) + "</b> · " + eur(s.price_cents) + "<br>" + esc(txt) + " a las <b>" + esc(S.time) + "</b> · " + (b ? "con " + esc(b.name) : "con el primer barbero libre");
}

/* Pago online (Stripe Checkout): modos off / optional / deposit / full que fija el dueño en el panel */
function payInfo() {
  var P = CFG.pay; if (!P || !P.enabled) return null;
  var s = CFG.services.filter(function (x) { return x.id === S.service; })[0]; if (!s || s.price_cents <= 0) return null;
  var online = P.mode === "deposit" || P.mode === "full" || (P.mode === "optional" && S.pay === "online");
  return { P: P, s: s, online: online, amt: P.mode === "deposit" ? Math.min(P.depositCents, s.price_cents) : s.price_cents };
}
function setGoLabel() {
  var go = $("#bk-go", root), i = payInfo(); if (!go) return;
  go.textContent = i && i.online ? "Pagar " + eur(i.amt) + " y confirmar" : "Confirmar cita";
}
function renderPay() {
  var el = $("#bk-pay", root); if (!el) return;
  var i = payInfo();
  if (!i) { el.innerHTML = ""; setGoLabel(); return; }
  var h = Math.round(CFG.rules.cancelMin / 60);
  var pol = "<p class='bx-small'>" + (i.P.mode === "optional"
    ? "Si pagas online, el pago <b>no es reembolsable</b> (puedes cambiar la fecha hasta " + h + " h antes). Pagando en la barbería puedes cancelar gratis hasta " + h + " h antes."
    : "El pago <b>no es reembolsable</b>, pero puedes cambiar la fecha de tu cita hasta " + h + " h antes.") + "</p>" +
    "<label class='bk-terms' id='bk-nr'" + (i.online ? "" : " hidden") + "><input id='bk-nonref' type='checkbox'" + (S.nonref ? " checked" : "") + "><span>Entiendo que el pago es completo y no reembolsable; si no puedo venir, solo puedo cambiar la fecha de la cita.</span></label>";
  if (i.P.mode === "optional") {
    el.innerHTML = "<h3>Forma de pago</h3><div class='bk-svc' role='radiogroup' aria-label='Forma de pago'>" +
      "<label><input type='radio' name='bk-pay' value='online'" + (S.pay === "online" ? " checked" : "") + "><b>Pagar ahora<small> · tarjeta, Apple Pay o Google Pay</small></b><em>" + eur(i.amt) + "</em></label>" +
      "<label><input type='radio' name='bk-pay' value='shop'" + (S.pay !== "online" ? " checked" : "") + "><b>Pagar en la barbería<small> · al terminar</small></b><em>" + eur(i.s.price_cents) + "</em></label></div>" + pol;
    el.querySelectorAll("[name=bk-pay]").forEach(function (r) { r.addEventListener("change", function () { S.pay = r.value; var nr = $("#bk-nr", el); if (nr) nr.hidden = S.pay !== "online"; setGoLabel(); }); });
  } else {
    el.innerHTML = "<div class='bk-paynote'>" + (i.P.mode === "deposit"
      ? "Para confirmar la cita se paga ahora una <b>señal de " + eur(i.amt) + "</b> con tarjeta (también Apple Pay o Google Pay). El resto (" + eur(i.s.price_cents - i.amt) + ") se paga en la barbería."
      : "Para confirmar la cita se paga ahora <b>" + eur(i.amt) + "</b> con tarjeta (también Apple Pay o Google Pay). No tendrás que pagar nada más.") + "</div>" + pol;
  }
  var nb = $("#bk-nonref", el); if (nb) nb.addEventListener("change", function () { S.nonref = nb.checked; });
  setGoLabel();
}

function submitBooking() {
  var m = $("#bk-msg", root), btn = $("#bk-go", root);
  var name = $("#bk-name", root).value.trim(), phone = $("#bk-phone", root).value.trim(), email = $("#bk-email", root).value.trim();
  if (!name) { msg(m, "Escribe tu nombre.", "err"); $("#bk-name", root).focus(); return; }
  if (phone.replace(/\D/g, "").length < 9) { msg(m, "Escribe un teléfono válido.", "err"); $("#bk-phone", root).focus(); return; }
  if (!$("#bk-terms", root).checked) { msg(m, "Acepta la política de privacidad para continuar.", "err"); return; }
  var pi = payInfo();
  if (pi && pi.online && !S.nonref) { msg(m, "Marca la casilla: el pago es completo y no reembolsable.", "err"); return; }
  btn.disabled = true; msg(m, "Reservando…");
  api("POST", "/api/book", { name: name, phone: phone, email: email, service: S.service, barber: S.barber, start: S.date + " " + S.time, terms: true, note: S.note || "", pay: S.pay === "online" ? "online" : "shop", nonref: !!S.nonref }).then(function (r) {
    if (r.checkoutUrl) { msg(m, "Te llevamos al pago seguro de Stripe…", "ok"); location.href = r.checkoutUrl; return; }
    showBooked(r.booking, !!email);
  }).catch(function (e) {
    btn.disabled = false; msg(m, e.message, "err");
    if (e.status === 409) { S.time = null; loadSlots(); }
  });
}

/* Avisos push de la cita (opcional, gratis): botón que activa los recordatorios en este móvil */
function wirePush(btn, out, code) {
  if (!btn) return;
  if (!window.BBPWA) { btn.hidden = true; return; }
  btn.addEventListener("click", function () {
    btn.disabled = true; out.textContent = "";
    BBPWA.subscribe({ code: code }).then(function () { out.className = "bx-msg ok"; out.textContent = "Listo: te avisaremos en este móvil antes de tu cita."; btn.hidden = true; })
      .catch(function (e) { btn.disabled = false; out.className = "bx-msg err"; out.textContent = e && e.friendly ? e.message : "No se pudo activar el aviso."; });
  });
}

function showBooked(b, hasEmail) {
  var cal = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent("Cita en Barbería") + "&dates=" + b.start.replace(/[-: ]/g, "").slice(0, 13) + "00/" + b.start.replace(/[-: ]/g, "").slice(0, 13) + "00&ctz=Europe%2FMadrid";
  root.innerHTML = "<div class='bk-ok'><div class='tick' aria-hidden='true'>✓</div><h3 style='margin:0 0 .5rem;font-size:1.3rem;color:var(--bone);text-transform:none;letter-spacing:0'>¡Cita confirmada!</h3>" +
    "<p style='font-size:1.05rem;line-height:1.6'><b>" + esc(b.whenText) + "</b><br>" + esc(b.service) + " · " + eur(b.price_cents) + (b.barber ? "<br>Con " + esc(b.barber) : "") + "</p>" +
    "<p class='bx-small' style='margin:1rem 0'>" + (hasEmail ? "Te hemos enviado la confirmación por correo y te avisaremos 24 h antes." : "Guarda esta página: no dejaste correo, así que no recibirás recordatorio. Te avisaremos por WhatsApp si hace falta.") + "</p>" +
    "<div style='display:flex;flex-wrap:wrap;gap:.6rem;justify-content:center'><a class='bx-ghost' href='" + esc(cal) + "' target='_blank' rel='noopener'>Añadir al calendario</a><a class='bx-ghost' href='?cita=" + esc(b.code) + "'>Ver o cancelar</a><button type='button' class='bx-ghost' id='bk-again'>Otra cita</button></div>" +
    "<div style='display:flex;flex-wrap:wrap;gap:.6rem;justify-content:center;margin-top:.8rem'><button type='button' class='bx-ghost' id='bk-push'>🔔 Avisarme en este móvil</button><button type='button' class='bx-ghost' data-install hidden>Instalar la app</button></div><p id='bk-push-msg' class='bx-msg' role='status'></p></div>";
  $("#bk-again", root).addEventListener("click", function () { S.time = null; renderBooking(); loadSlots(); });
  wirePush($("#bk-push", root), $("#bk-push-msg", root), b.code);
  if (window.BBPWA) { BBPWA.refresh(); }
  if (USER) { refreshMe(); }
  root.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ---------------------------------------------------------------- CUENTA / CLUB */
var dlg;
function ensureDialog() {
  if (dlg) return dlg;
  dlg = document.createElement("dialog");
  dlg.className = "cx"; dlg.setAttribute("aria-labelledby", "cx-title");
  document.body.appendChild(dlg);
  dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", function () { document.documentElement.style.overflow = ""; });
  return dlg;
}
function showDlg(html) {
  var d = ensureDialog();
  d.innerHTML = "<div class='cx-in'>" + html + "</div>";
  var x = $(".cx-x", d); if (x) x.addEventListener("click", function () { d.close(); });
  if (!d.open) { document.documentElement.style.overflow = "hidden"; d.showModal(); }
  return d;
}
function top(title) { return "<div class='cx-top'><h2 id='cx-title'>" + esc(title) + "</h2><button type='button' class='cx-x' aria-label='Cerrar'>✕</button></div>"; }

function openAccount(tab) {
  if (USER) return renderAccount();
  renderAuth(tab || "login");
}

function renderAuth(tab, extra) {
  var reg = tab === "register", ref = new URLSearchParams(location.search).get("ref") || "";
  var d = showDlg(top(reg ? "Crear cuenta" : "Entrar") +
    "<div class='cx-tabs' role='tablist'><button type='button' class='bx-chip' data-tab='login' aria-pressed='" + !reg + "'>Entrar</button><button type='button' class='bx-chip' data-tab='register' aria-pressed='" + reg + "'>Crear cuenta</button></div>" +
    (reg ? "<p class='bx-small'>Únete al club: <b>puntos con cada cita</b> y premios (cortes, barba, productos). Empiezas con " + CFG.rules.welcomePoints + " puntos.</p>" : "") +
    "<form id='cx-form' novalidate>" +
    (reg ? "<label class='bx-lab' for='cx-name'>Nombre</label><input id='cx-name' class='bx-in' autocomplete='given-name' maxlength='60'>" : "") +
    "<label class='bx-lab' for='cx-email'>Correo</label><input id='cx-email' class='bx-in' type='email' autocomplete='email' maxlength='120'>" +
    (reg ? "<label class='bx-lab' for='cx-phone'>Teléfono <span class='bx-small'>(opcional)</span></label><input id='cx-phone' class='bx-in' type='tel' autocomplete='tel' maxlength='20'>" : "") +
    "<label class='bx-lab' for='cx-pass'>Contraseña " + (reg ? "<span class='bx-small'>(mínimo 8 caracteres)</span>" : "") + "</label><input id='cx-pass' class='bx-in' type='password' autocomplete='" + (reg ? "new-password" : "current-password") + "' maxlength='128'>" +
    (reg ? "<label class='bk-terms'><input id='cx-terms' type='checkbox'><span>Acepto la <a href='#privacidad' data-legal-link>Política de Privacidad</a>.</span></label><label class='bk-terms'><input id='cx-mkt' type='checkbox'><span>Quiero recibir ofertas y novedades por correo (opcional).</span></label>" : "") +
    "<p id='cx-msg' class='bx-msg' role='status' aria-live='polite'>" + esc(extra || "") + "</p>" +
    "<button type='submit' class='bx-btn' style='width:100%'>" + (reg ? "Crear mi cuenta" : "Entrar") + "</button></form>" +
    (reg ? "" : "<button type='button' class='cx-link' id='cx-forgot'>He olvidado mi contraseña</button>"));
  d.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { renderAuth(b.dataset.tab); }); });
  var lg = $("[data-legal-link]", d); if (lg) lg.addEventListener("click", function (e) { d.close(); openLegal(e); });
  var f = $("#cx-form", d), m = $("#cx-msg", d);
  f.addEventListener("submit", function (e) {
    e.preventDefault(); msg(m, "Un momento…");
    var body = { email: $("#cx-email", d).value, password: $("#cx-pass", d).value };
    if (reg) {
      body.name = $("#cx-name", d).value; body.phone = $("#cx-phone", d).value; body.terms = $("#cx-terms", d).checked; body.marketing = $("#cx-mkt", d).checked; if (ref) body.ref = ref;
      if (!body.terms) { msg(m, "Acepta la política de privacidad para continuar.", "err"); return; }
    }
    api("POST", "/api/auth/" + (reg ? "register" : "login"), body).then(function () { return refreshMe(); }).then(function () { renderAccount(); renderBooking(); loadSlots(); }).catch(function (er) { msg(m, er.message, "err"); });
  });
  var fg = $("#cx-forgot", d);
  if (fg) fg.addEventListener("click", function () {
    var email = $("#cx-email", d).value;
    if (!email) { msg(m, "Escribe tu correo arriba y pulsa de nuevo.", "err"); return; }
    api("POST", "/api/auth/forgot", { email: email }).then(function () { msg(m, "Si ese correo tiene cuenta, te hemos enviado un enlace para elegir otra contraseña.", "ok"); }).catch(function (er) { msg(m, er.message, "err"); });
  });
  setTimeout(function () { var i = $("input", f); if (i) i.focus(); }, 50);
}

var ME = null;
function refreshMe() {
  return api("GET", "/api/me").then(function (r) { USER = r.user; ME = r; updateHeader(); return r; }).catch(function () { USER = null; });
}

function renderAccount() {
  if (!ME || !USER) return renderAuth("login");
  var r = ME;
  var up = r.upcoming.length ? r.upcoming.map(function (b) {
    return "<li><span><b>" + esc(b.whenText) + "</b><small>" + esc(b.service_name) + " · " + esc(b.barber) + "</small></span>" + (b.pay_status === "paid" ? "<a class='bx-ghost' href='?cita=" + esc(b.code) + "'>Cambiar fecha</a>" : "<button type='button' class='bx-ghost' data-cancel='" + esc(b.code) + "'>Cancelar</button>") + "</li>";
  }).join("") : "<li><span class='bx-small'>No tienes citas pendientes.</span><a class='bx-ghost' href='#reservas' data-close-dlg>Reservar</a></li>";
  var rw = CFG.rewards.map(function (x) {
    var can = r.points >= x.cost;
    return "<li><span><b>" + esc(x.name) + "</b><small>" + x.cost + " puntos</small></span><button type='button' class='bx-btn' style='min-height:40px;padding:0 1rem;font-size:.85rem' data-redeem='" + x.id + "'" + (can ? "" : " disabled") + ">Canjear</button></li>";
  }).join("");
  var reds = r.redemptions.length ? r.redemptions.map(function (x) { return "<li><span><b>" + esc(x.reward_name) + "</b><small>" + (x.status === "used" ? "Ya usado" : "Enseña este código en la barbería") + "</small></span><span class='cx-code'>" + esc(x.code) + "</span></li>"; }).join("") : "";
  var led = r.ledger.map(function (x) { return "<li><span>" + esc(x.reason) + "</span><b style='color:" + (x.delta > 0 ? "var(--ok)" : "var(--bad)") + "'>" + (x.delta > 0 ? "+" : "") + x.delta + "</b></li>"; }).join("");
  var link = location.origin + "/?ref=" + r.user.refCode;
  var d = showDlg(top("Hola, " + r.user.name.split(" ")[0]) +
    "<div class='cx-pts'><b>" + r.points + "</b><span>puntos del club</span></div>" +
    "<h3>Próximas citas</h3><ul class='cx-list'>" + up + "</ul>" +
    "<h3>Premios</h3><ul class='cx-list'>" + rw + "</ul><p id='cx-msg' class='bx-msg' role='status' aria-live='polite'></p>" +
    (reds ? "<h3>Mis canjes</h3><ul class='cx-list'>" + reds + "</ul>" : "") +
    "<h3>Trae a un amigo</h3><p class='bx-small'>Si tu amigo se registra con tu enlace y hace su primera cita, os damos <b>" + r.referralPoints + " puntos</b> a los dos.</p><div style='display:flex;gap:.5rem;margin-top:.5rem'><input class='bx-in' style='margin:0' readonly value='" + esc(link) + "' aria-label='Tu enlace'><button type='button' class='bx-ghost' id='cx-copy'>Copiar</button></div>" +
    (led ? "<h3>Movimientos</h3><ul class='cx-list'>" + led + "</ul>" : "") +
    "<h3>Ajustes</h3><label class='bk-terms' style='margin-top:0'><input id='cx-mkt' type='checkbox'" + (r.user.marketing ? " checked" : "") + "><span>Recibir ofertas y novedades por correo</span></label>" +
    "<div style='display:flex;flex-wrap:wrap;gap:1rem;margin-top:.8rem'><button type='button' class='cx-link' id='cx-out'>Cerrar sesión</button><button type='button' class='cx-link danger' id='cx-del'>Borrar mi cuenta</button></div>");
  var m = $("#cx-msg", d);
  d.querySelectorAll("[data-close-dlg]").forEach(function (a) { a.addEventListener("click", function () { d.close(); }); });
  d.querySelectorAll("[data-cancel]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!confirm("¿Cancelar esta cita?")) return;
      api("POST", "/api/cancel", { code: b.dataset.cancel }).then(function () { return refreshMe(); }).then(renderAccount).catch(function (e) { alert(e.message); });
    });
  });
  d.querySelectorAll("[data-redeem]").forEach(function (b) {
    b.addEventListener("click", function () {
      api("POST", "/api/club/redeem", { rewardId: Number(b.dataset.redeem) }).then(function () { return refreshMe(); }).then(renderAccount).catch(function (e) { msg(m, e.message, "err"); });
    });
  });
  $("#cx-copy", d).addEventListener("click", function () { try { navigator.clipboard.writeText(link); msg(m, "Enlace copiado.", "ok"); } catch (e) { msg(m, "Cópialo a mano.", "err"); } });
  $("#cx-mkt", d).addEventListener("change", function (e) { api("POST", "/api/auth/marketing", { marketing: e.target.checked }).catch(function (er) { msg(m, er.message, "err"); }); });
  $("#cx-out", d).addEventListener("click", function () { api("POST", "/api/auth/logout", {}).then(function () { USER = null; ME = null; updateHeader(); d.close(); renderBooking(); loadSlots(); }); });
  $("#cx-del", d).addEventListener("click", function () {
    var p = prompt("Para borrar tu cuenta y tus puntos escribe tu contraseña:");
    if (!p) return;
    api("POST", "/api/auth/delete", { password: p }).then(function () { USER = null; ME = null; updateHeader(); d.close(); renderBooking(); loadSlots(); }).catch(function (e) { msg(m, e.message, "err"); });
  });
}

function updateHeader() {
  document.querySelectorAll("[data-account-btn]").forEach(function (b) {
    b.textContent = USER ? "Mi club" + (ME ? " · " + ME.points + " pts" : "") : "Entrar";
  });
}

/* ---------------------------------------------------------------- CITA POR ENLACE Y RESET */
function handleParams() {
  var p = new URLSearchParams(location.search), cita = p.get("cita"), reset = p.get("reset");
  if (cita && /^[0-9a-f]{24}$/.test(cita)) {
    showCita(cita, p.get("pago"), 0);
    history.replaceState(null, "", location.pathname);
  } else if (reset && /^[0-9a-f]{64}$/.test(reset)) {
    var d = showDlg(top("Nueva contraseña") + "<form id='rs'><label class='bx-lab' for='rs-p' style='margin-top:0'>Contraseña nueva <span class='bx-small'>(mínimo 8 caracteres)</span></label><input id='rs-p' class='bx-in' type='password' autocomplete='new-password' maxlength='128'><p id='rs-m' class='bx-msg' role='status'></p><button class='bx-btn' style='width:100%'>Guardar</button></form>");
    $("#rs", d).addEventListener("submit", function (e) {
      e.preventDefault();
      api("POST", "/api/auth/reset", { token: reset, password: $("#rs-p", d).value }).then(function () { history.replaceState(null, "", location.pathname); renderAuth("login", "Contraseña cambiada. Ya puedes entrar."); }).catch(function (er) { msg($("#rs-m", d), er.message, "err"); });
    });
  } else if (p.get("ref")) {
    // Llega recomendado por un amigo: se abre el registro con su código guardado
    if (!USER) renderAuth("register");
  }
}

// Cambiar la fecha de una cita: mismo servicio y barbero, nuevo hueco libre
function openMove(cita, r) {
  var b = r.booking, today = todayLocal(), days = "", chosen = null;
  for (var i = 0; i <= Math.min(CFG.rules.maxDays, 20); i++) {
    var dd = addDays(today, i), open = (CFG.hours[String(dow(dd))] || []).length > 0;
    days += '<button type="button" class="bk-day" data-md="' + dd + '"' + (open ? "" : " disabled") + ' aria-pressed="false" aria-label="' + esc(DOW[dow(dd)] + " " + dd.slice(8)) + '"><span>' + (i === 0 ? "hoy" : DOW[dow(dd)]) + "</span><b>" + Number(dd.slice(8)) + "</b></button>";
  }
  var d = showDlg(top("Cambiar fecha") + "<p class='bx-small' style='margin-top:0'>" + esc(b.service) + " con " + esc(b.barber) + ". Ahora: <b>" + esc(b.whenText) + "</b>.</p>" +
    "<div class='bk-days' role='group' aria-label='Día'>" + days + "</div><div id='mv-slots' class='bk-slots' aria-live='polite'></div><p id='mv-msg' class='bx-msg' role='status'></p>" +
    "<button type='button' class='bx-btn' id='mv-go' style='width:100%;margin-top:.4rem' disabled>Confirmar nueva fecha</button>");
  var m = $("#mv-msg", d), go = $("#mv-go", d), box = $("#mv-slots", d);
  d.querySelectorAll("[data-md]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      chosen = null; go.disabled = true;
      d.querySelectorAll("[data-md]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === btn)); });
      box.innerHTML = ""; msg(m, "Buscando huecos…");
      api("GET", "/api/availability?date=" + btn.dataset.md + "&service=" + b.service_id + "&barber=" + b.barber_id).then(function (a) {
        if (!a.slots.length) { msg(m, "Ese día no hay huecos libres. Prueba con otro.", "err"); return; }
        msg(m, "");
        box.innerHTML = a.slots.map(function (s) { return '<button type="button" class="bx-chip" data-mt="' + s.time + '" aria-pressed="false">' + s.time + "</button>"; }).join("");
        box.querySelectorAll("[data-mt]").forEach(function (c) {
          c.addEventListener("click", function () {
            chosen = btn.dataset.md + " " + c.dataset.mt; go.disabled = false;
            box.querySelectorAll("[data-mt]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === c)); });
          });
        });
      }).catch(function (e) { msg(m, e.message, "err"); });
    });
  });
  go.addEventListener("click", function () {
    if (!chosen) return; go.disabled = true; msg(m, "Cambiando…");
    api("POST", "/api/reschedule", { code: cita, start: chosen }).then(function (x) {
      showDlg(top("¡Cita cambiada!") + "<p style='font-size:1.1rem;line-height:1.6'><b>" + esc(x.booking.whenText) + "</b><br>" + esc(x.booking.service) + (x.booking.barber ? "<br>Con " + esc(x.booking.barber) : "") + "</p><p class='bx-small'>Te hemos enviado la confirmación por correo (si dejaste uno). " + (x.movesLeft > 0 ? "Te quedan " + x.movesLeft + " cambio" + (x.movesLeft === 1 ? "" : "s") + "." : "Ya no quedan más cambios para esta cita.") + "</p>");
      if (USER) refreshMe();
    }).catch(function (e) { go.disabled = false; msg(m, e.message, "err"); if (e.status === 409) { chosen = null; box.innerHTML = ""; } });
  });
}

function showCita(cita, pago, tries) {
  api("GET", "/api/booking?code=" + cita).then(function (r) {
    var b = r.booking, pending = b.pay_status === "pending" && b.status === "booked";
    // Volvemos de Stripe: el aviso de cobro (webhook) puede tardar unos segundos
    if (pago === "ok" && pending && tries < 8) {
      if (tries === 0) showDlg(top("Comprobando tu pago") + "<p class='bx-msg' role='status'>Estamos confirmando tu pago con el banco…</p>");
      setTimeout(function () { showCita(cita, pago, tries + 1); }, 1500); return;
    }
    var note = "";
    if (b.pay_status === "paid") note = "<p class='bx-msg ok'>" + (pago === "ok" ? "¡Pago recibido! " : "") + "Pagado online: " + eur(b.pay_cents) + (b.pay_cents < b.price_cents ? " · el resto (" + eur(b.price_cents - b.pay_cents) + ") en la barbería." : " · no tienes que pagar nada más.") + "</p>";
    else if (pending && pago === "ok") note = "<p class='bx-msg'>Tu pago está en proceso. Te enviaremos la confirmación por correo en cuanto el banco lo confirme.</p>";
    else if (pending) note = "<p class='bx-msg err'>" + (pago === "cancel" ? "No se completó el pago. " : "") + "Tu hueco sigue reservado unos minutos: paga para confirmar la cita.</p>";
    else if (b.pay_status === "refunded") note = "<p class='bx-msg'>Pago reembolsado (" + eur(b.pay_cents) + "). Puede tardar unos días en verse en tu tarjeta.</p>";
    var actions = "", paid = b.pay_status === "paid";
    if (b.status === "cancelled") actions = "<p class='bx-msg err'>Esta cita está cancelada.</p>";
    else if (b.status !== "booked") actions = "<p class='bx-msg'>Esta cita ya ha pasado.</p>";
    else {
      if (pending) actions += "<button type='button' class='bx-btn' id='ct-pay' style='width:100%;margin-top:.8rem'>Pagar ahora</button>";
      if (r.canMove) actions += "<button type='button' class='" + (pending ? "bx-ghost" : "bx-btn") + "' id='ct-move' style='width:100%;margin-top:.8rem'>Cambiar fecha u hora" + (r.movesLeft < 2 ? " (" + r.movesLeft + " cambio" + (r.movesLeft === 1 ? "" : "s") + " restante" + (r.movesLeft === 1 ? "" : "s") + ")" : "") + "</button>";
      if (r.canCancel) actions += "<button type='button' class='bx-ghost' id='ct-cancel' style='width:100%;margin-top:.8rem'>Cancelar mi cita</button>";
      if (paid) actions += "<p class='bx-small' style='margin-top:.8rem'>El pago online no es reembolsable: si no puedes venir, cambia la fecha" + (r.canMove ? "." : ". Ya no es posible (menos de " + Math.round(r.cancelMin / 60) + " h o sin cambios disponibles): llámanos.") + "</p>";
      else if (!r.canCancel && !pending) actions += "<p class='bx-msg'>Faltan menos de " + Math.round(r.cancelMin / 60) + " h: para cancelar llámanos.</p>";
      actions += "<p id='ct-msg' class='bx-msg' role='status'></p>";
    }
    var d = showDlg(top(pago === "ok" && b.pay_status === "paid" ? "¡Cita confirmada!" : "Tu cita") + "<p style='font-size:1.1rem;line-height:1.6'><b>" + esc(b.whenText) + "</b><br>" + esc(b.service) + " · " + eur(b.price_cents) + "<br>Con " + esc(b.barber) + "</p>" + note + actions);
    var c = $("#ct-cancel", d), pb = $("#ct-pay", d), mv = $("#ct-move", d);
    if (c || mv) { var pw = document.createElement("div"); pw.innerHTML = "<button type='button' class='bx-ghost' id='ct-push' style='width:100%;margin-top:.8rem'>🔔 Avisarme en este móvil</button><p id='ct-push-msg' class='bx-msg' role='status'></p>"; d.querySelector("#ct-msg").insertAdjacentElement("beforebegin", pw); wirePush($("#ct-push", d), $("#ct-push-msg", d), cita); }
    if (mv) mv.addEventListener("click", function () { openMove(cita, r); });
    if (pb) pb.addEventListener("click", function () {
      pb.disabled = true; msg($("#ct-msg", d), "Abriendo el pago seguro…");
      api("POST", "/api/pay", { code: cita }).then(function (x) { location.href = x.checkoutUrl; }).catch(function (e) { pb.disabled = false; msg($("#ct-msg", d), e.message, "err"); });
    });
    if (c) c.addEventListener("click", function () {
      api("POST", "/api/cancel", { code: cita }).then(function (x) {
        msg($("#ct-msg", d), "Cita cancelada. Gracias por avisar.", "ok");
        c.hidden = true; if (pb) pb.hidden = true; if (mv) mv.hidden = true;
      }).catch(function (e) { msg($("#ct-msg", d), e.message, "err"); });
    });
  }).catch(function () { showDlg(top("Tu cita") + "<p class='bx-msg err'>No hemos encontrado esa cita.</p>"); });
}

/* ---------------------------------------------------------------- Club (sección) y carga perezosa de "Encuentra tu corte" */
function renderClub() {
  var el = $("#club-rewards");
  if (el) el.innerHTML = CFG.rewards.map(function (r) { return "<span><b>" + r.cost + "</b> pts · " + esc(r.name) + "</span>"; }).join("");
  var pe = $("#club-ppe"); if (pe) pe.textContent = CFG.rules.pointsPerEuro + " pt por €";
  var wp = $("#club-welcome"); if (wp) wp.textContent = CFG.rules.welcomePoints + " puntos";
  var rf = $("#club-ref"); if (rf) rf.textContent = CFG.rules.referralPoints + " puntos";
}
function lazyCortes() {
  var sec = $("#cortes"); if (!sec) return;
  var loaded = false;
  function load() {
    if (loaded) return; loaded = true;
    var s = document.createElement("script"); s.src = "cortes.js"; s.defer = true; document.body.appendChild(s);
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin: "600px" });
    io.observe(sec);
  } else { load(); }
}
window.BB = { api: api, esc: esc, eur: eur, msg: msg, getConfig: function () { return CFG; }, getUser: function () { return USER; }, openAccount: openAccount,
  // Cortes: preselecciona nota y lleva a reservas
  chooseCut: function (name) { S.note = name; var a = $("#reservas"); if (a) a.scrollIntoView({ behavior: "smooth" }); var box = $("#bk-cutnote"); if (box) { box.hidden = false; box.textContent = "Corte elegido: " + name; } } };

/* ---------------------------------------------------------------- Barber pole animado (rayas que giran y se aceleran al hacer scroll) */
function initPoles() {
  var els = [].slice.call(document.querySelectorAll(".bpole"));
  if (!els.length || !("IntersectionObserver" in window)) return;
  if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var off = 0, boost = 0, lastY = window.scrollY, raf = 0, vis = 0;
  function frame() {
    var y = window.scrollY, d = Math.abs(y - lastY); lastY = y;
    boost = Math.max(boost * 0.93, Math.min(d * 0.5, 16));
    off = (off - (0.45 + boost)) % 100000;
    els.forEach(function (e) { if (e._v) e.style.setProperty("--off", off.toFixed(1)); });
    raf = vis > 0 && !document.hidden ? requestAnimationFrame(frame) : 0;
  }
  var io = new IntersectionObserver(function (en) {
    en.forEach(function (x) { if (x.target._v !== x.isIntersecting) { x.target._v = x.isIntersecting; vis += x.isIntersecting ? 1 : -1; } });
    if (vis > 0 && !raf) { lastY = window.scrollY; raf = requestAnimationFrame(frame); }
  });
  els.forEach(function (e) { e._v = false; io.observe(e); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden && vis > 0 && !raf) raf = requestAnimationFrame(frame); });
}

/* ---------------------------------------------------------------- arranque */
function wireHeader() {
  document.querySelectorAll("[data-account-btn]").forEach(function (b) { b.addEventListener("click", function () { openAccount(); }); });
  document.querySelectorAll("[data-open-register]").forEach(function (b) { b.addEventListener("click", function () { USER ? renderAccount() : renderAuth("register"); }); });
}
function start() {
  wireHeader();
  initPoles();
  lazyCortes();
  Promise.all([api("GET", "/api/config"), api("GET", "/api/me").catch(function () { return { user: null }; })]).then(function (r) {
    CFG = r[0]; USER = r[1].user; ME = r[1].user ? r[1] : null;
    document.documentElement.classList.add("has-api");
    updateHeader(); renderClub(); initBooking(); handleParams();
  }).catch(function () {
    // Sin servidor (por ejemplo, solo páginas estáticas): se mantiene la reserva por WhatsApp y se ocultan cuenta y club
    document.querySelectorAll("[data-needs-api]").forEach(function (el) { el.hidden = true; });
    lazyCortes();
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
