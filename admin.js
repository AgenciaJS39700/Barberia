/* admin.js · Panel de la barbería (jefe y barberos). Los permisos se aplican SIEMPRE en el servidor;
   aquí solo se adapta lo que se muestra a cada rol. */
(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var eur = function (c) { return (c / 100).toFixed(2).replace(".", ",") + " €"; };
  var store = {
    get: function (k) { try { return sessionStorage.getItem(k) || localStorage.getItem(k) || ""; } catch (e) { return ""; } },
    ses: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} },
    loc: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch (e) {} }
  };
  var madridDay = function () { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date()); };
  var TOKEN = "", ME = null, CAT = null, TAB = "agenda", DATE = madridDay(), LAST = null, TIMER = 0;
  var VIEW = store.get("bbview") || "line", FILT = store.get("bbfilt") || "", SPAN = store.get("bbspan") === "week" ? "week" : "day";

  /* ---------- utilidades ---------- */
  function api(m, p, b) {
    return fetch("/api/admin/" + p, { method: m, headers: Object.assign({ "x-admin-token": TOKEN }, b ? { "content-type": "application/json" } : {}), body: b ? JSON.stringify(b) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || "Error"); e.status = r.status; throw e; } return j; }); });
  }
  function addDays(d, n) { var o = new Date(d + "T00:00:00Z"); o.setUTCDate(o.getUTCDate() + n); return o.toISOString().slice(0, 10); }
  function toMin(t) { return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)); }
  function hhmm(m) { return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
  function stamp(dt) { return Date.UTC(+dt.slice(0, 4), +dt.slice(5, 7) - 1, +dt.slice(8, 10), +dt.slice(11, 13), +dt.slice(14, 16)) / 60000; }
  var DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"], MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  function longDate(d) { var o = new Date(d + "T00:00:00Z"); return DAYS[o.getUTCDay()] + " " + o.getUTCDate() + " " + MONTHS[o.getUTCMonth()]; }
  function waLink(phone, text) { var d = String(phone || "").replace(/\D/g, ""); if (d.length === 9) d = "34" + d; return "https://wa.me/" + d + (text ? "?text=" + encodeURIComponent(text) : ""); }
  function isOwner() { return !!ME && ME.role === "owner"; }
  function toast(msg, bad) { var m = $("#pushmsg"); m.className = "bx-msg " + (bad ? "err" : "ok"); m.textContent = msg; clearTimeout(toast.t); toast.t = setTimeout(function () { if (m.textContent === msg) m.textContent = ""; }, 4000); }
  function catalog() { return CAT ? Promise.resolve(CAT) : api("GET", "catalog").then(function (c) { CAT = c; return c; }); }

  /* ---------- diálogos ---------- */
  function sheet(html, onReady) {
    var d = document.createElement("dialog"); d.className = "cx"; d.setAttribute("aria-label", "Detalle");
    d.innerHTML = "<div class='cx-in'>" + html + "</div>";
    d.addEventListener("close", function () { d.remove(); });
    d.addEventListener("click", function (e) { if (e.target === d) d.close(); });
    document.body.appendChild(d); d.showModal();
    if (onReady) onReady(d);
    return d;
  }

  /* ---------- acceso ---------- */
  function persist(remember) { store.ses("bbt", TOKEN); if (remember) store.loc("bbt", TOKEN); else try { localStorage.removeItem("bbt"); } catch (e) {} }
  function enter(remember) {
    return api("GET", "me").then(function (me) { ME = me; persist(remember); shell(); setTimeout(askPush, 900); });
  }
  function login() {
    TOKEN = $("#tk").value.trim();
    enter($("#rm").checked).catch(function (e) { TOKEN = ""; $("#lm").textContent = e.status === 401 ? "Contraseña o clave incorrecta." : e.message; $("#lm").className = "bx-msg err"; });
  }
  function logout() { store.del("bbt"); location.reload(); }

  /* ---------- estructura ---------- */
  function tabsFor() {
    var t = [["agenda", "Agenda"]];
    if (isOwner()) t.push(["resumen", "Resumen"]);
    t.push(["clientes", "Clientes"], ["canjes", "Canjes"], ["avisos", "WhatsApp"]);
    if (isOwner()) t.push(["equipo", "Equipo"], ["ajustes", "Ajustes"]);
    return t;
  }
  function shell() {
    $("#login").hidden = true; $("#app").hidden = false;
    $("#who").textContent = isOwner() ? "Hola, jefe · ves y gestionas todo" : "Hola, " + ME.name + " · tu agenda y la de tus compañeros";
    $("#tabs").innerHTML = tabsFor().map(function (t) { return "<button type='button' class='bx-chip' role='tab' data-t='" + t[0] + "' aria-pressed='" + (TAB === t[0]) + "'>" + t[1] + "</button>"; }).join("");
    $$("#tabs [data-t]").forEach(function (b) { b.addEventListener("click", function () { TAB = b.dataset.t; shell(); show(); }); });
    pushState(); show(); clearInterval(TIMER);
    TIMER = setInterval(function () { if (!document.hidden && TAB === "agenda" && !document.querySelector("dialog[open]")) show(true); }, 60000);
  }
  var VIEWS = { agenda: agenda, avisos: avisos, clientes: clientes, canjes: canjes, ajustes: ajustes, resumen: resumen, equipo: equipo };
  function show(quiet) {
    var v = $("#view"); if (!quiet) v.innerHTML = "<p class='bx-small'>Cargando…</p>";
    VIEWS[TAB](v).catch(function (e) {
      if (e.status === 401) { store.del("bbt"); location.reload(); } else if (!quiet) v.innerHTML = "<p class='bx-msg err'>" + esc(e.message) + "</p>";
    });
  }

  /* ---------- AGENDA ---------- */
  function visibleBarbers(a) { return FILT && FILT !== "all" ? a.barbers.filter(function (b) { return String(b.id) === FILT; }) : a.barbers; }
  function agenda(v) {
    if (SPAN === "week") return Promise.all([api("GET", "week?date=" + DATE), catalog()]).then(function (r) {
      if (!FILT) FILT = isOwner() ? "all" : String(ME.barberId);
      if (FILT !== "all" && !r[0].barbers.some(function (b) { return String(b.id) === FILT; })) FILT = "all";
      LAST = r[0]; drawWeek(v, r[0], r[1]);
    });
    return Promise.all([api("GET", "agenda?date=" + DATE), catalog()]).then(function (r) {
      LAST = r[0];
      if (!FILT) FILT = isOwner() ? "all" : String(ME.barberId);
      if (FILT !== "all" && !LAST.barbers.some(function (b) { return String(b.id) === FILT; })) FILT = "all";
      draw(v, LAST, r[1]);
    });
  }
  var KEEP = null;
  function draw(v, a, c) {
    var oldTl = $(".tl", v); KEEP = oldTl && oldTl.dataset.d === DATE ? oldTl.scrollTop : null;
    var bars = visibleBarbers(a), ids = bars.map(function (b) { return b.id; });
    var mine = a.bookings.filter(function (b) { return ids.indexOf(b.barber_id) >= 0; });
    var live = mine.filter(function (b) { return b.status !== "cancelled"; });
    var isToday = DATE === a.now.slice(0, 10);
    var next = isToday ? live.filter(function (b) { return b.status === "booked" && b.start_at >= a.now; })[0] : null;
    var done = live.filter(function (b) { return b.status === "done"; }).length, pending = live.filter(function (b) { return b.status === "booked"; }).length;
    var chips = "<button type='button' class='bx-chip' data-f='all' aria-pressed='" + (FILT === "all") + "'>Todos</button>" + a.barbers.map(function (b) {
      var me = ME.barberId === b.id; return "<button type='button' class='bx-chip' data-f='" + b.id + "' aria-pressed='" + (String(b.id) === FILT) + "'>" + esc(b.name) + (me ? " (yo)" : "") + "</button>";
    }).join("");
    var head = "<div class='ag-head'><div class='ag-nav'><button class='bx-ghost' id='pv' aria-label='Día anterior'>←</button><input id='dt' type='date' class='bx-in' value='" + DATE + "' aria-label='Día'><button class='bx-ghost' id='nx' aria-label='Día siguiente'>→</button><button class='bx-ghost' id='td'>Hoy</button></div>" +
      "<div class='ag-day'>" + spanToggle() + "<b>" + esc(longDate(DATE)) + "</b>" + (isToday ? " · hoy" : "") + "</div>" +
      "<div class='ag-sum'><span><b>" + live.length + "</b> citas</span><span><b>" + done + "</b> hechas</span><span><b>" + pending + "</b> por hacer</span>" +
      (next ? "<span class='ag-next'>Próxima: <b>" + esc(next.start_at.slice(11)) + "</b> " + esc(next.name) + " <small>(en " + relMin(stamp(next.start_at) - stamp(a.now)) + ")</small></span>" : "") + "</div></div>" +
      "<div class='ag-tools'><div class='ag-chips' role='group' aria-label='Barbero'>" + chips + "</div><div class='ag-btns'><button class='bx-btn' id='nw'>＋ Nueva cita</button><button class='bx-ghost' id='bk'>Bloquear horas</button>" +
      "<button class='bx-ghost' id='vw' aria-pressed='" + (VIEW === "list") + "'>" + (VIEW === "list" ? "▦ Horas" : "☰ Lista") + "</button></div></div>";
    var wl = (a.waitlist || []).length ? "<button type='button' class='ag-wait' id='wl'>⏳ " + a.waitlist.length + (a.waitlist.length === 1 ? " persona espera" : " personas esperan") + " hueco este día · ver</button>" : "";
    v.innerHTML = head + wl + (VIEW === "list" ? listView(mine, a) : timeline(a, c, bars, mine)) + "<p class='bx-small ag-foot'>Toca una cita para ver al cliente, llamarle, moverla o marcarla. Toca un hueco libre para crear una cita ahí.</p>";
    wireAgenda(v, a, c);
  }
  function relMin(m) { m = Math.max(0, Math.round(m)); return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + (m % 60 ? (m % 60) + " min" : ""); }
  var STATE = { booked: "Pendiente", done: "Realizada", noshow: "No vino", cancelled: "Cancelada" };

  function timeline(a, c, bars, list) {
    var wd = new Date(DATE + "T00:00:00Z").getUTCDay(), wins = (c.hours[wd] || []).map(function (w) { return [toMin(w[0]), toMin(w[1])]; });
    var lo = wins.length ? Math.min.apply(null, wins.map(function (w) { return w[0]; })) : 9 * 60, hi = wins.length ? Math.max.apply(null, wins.map(function (w) { return w[1]; })) : 20 * 60;
    var items = list.filter(function (b) { return b.status !== "cancelled"; });
    items.forEach(function (b) { lo = Math.min(lo, toMin(b.start_at.slice(11))); hi = Math.max(hi, toMin(b.end_at.slice(11))); });
    lo = Math.floor(lo / 60) * 60; hi = Math.min(24 * 60, Math.ceil(hi / 60) * 60);
    var PX = 1.55, H = (hi - lo) * PX, isToday = DATE === a.now.slice(0, 10);
    var axis = ""; for (var m = lo; m <= hi; m += 60) axis += "<span style='top:" + ((m - lo) * PX) + "px'>" + hhmm(m) + "</span>";
    var closed = ""; // franjas fuera del horario del local
    var edges = [[lo, wins.length ? wins[0][0] : hi]].concat(wins.slice(0, -1).map(function (w, i) { return [w[1], wins[i + 1][0]]; }), [[wins.length ? wins[wins.length - 1][1] : hi, hi]]);
    edges.forEach(function (e) { if (e[1] > e[0]) closed += "<i class='tl-x' style='top:" + ((e[0] - lo) * PX) + "px;height:" + ((e[1] - e[0]) * PX) + "px'></i>"; });
    var cols = bars.map(function (br) {
      var blocks = a.blocks.filter(function (k) { return k.barber_id == null || k.barber_id === br.id; }).map(function (k) {
        var s = Math.max(lo, k.start_at.slice(0, 10) < DATE ? lo : toMin(k.start_at.slice(11))), e = Math.min(hi, k.end_at.slice(0, 10) > DATE ? hi : toMin(k.end_at.slice(11)));
        return e > s ? "<button type='button' class='tl-b tl-k' data-k='" + k.id + "' style='top:" + ((s - lo) * PX) + "px;height:" + ((e - s) * PX - 2) + "px' aria-label='Bloqueo'>⛔ " + esc(k.note || "Bloqueado") + "</button>" : "";
      }).join("");
      var bk = items.filter(function (b) { return b.barber_id === br.id; }).map(function (b) {
        var s = toMin(b.start_at.slice(11)), e = toMin(b.end_at.slice(11)), h = Math.max((e - s) * PX - 2, 30), tall = h >= 58;
        var flags = (b.pay_status === "paid" ? " 💳" : "") + (b.cnote ? " 📝" : "") + (b.noshows >= 2 ? " ⚠️" : "");
        return "<button type='button' class='tl-b s-" + b.status + "' data-b='" + b.id + "' style='top:" + ((s - lo) * PX) + "px;height:" + h + "px'><b>" + esc(b.start_at.slice(11)) + "</b> " + esc(b.name) + flags + (tall ? "<small>" + esc(b.service_name) + "</small>" : "") + "</button>";
      }).join("");
      return "<div class='tl-col' data-bar='" + br.id + "'><div class='tl-h'>" + esc(br.name) + (ME.barberId === br.id ? " ★" : "") + "</div><div class='tl-body' style='height:" + H + "px' data-lo='" + lo + "'>" + closed + blocks + bk + "</div></div>";
    }).join("");
    var nowLine = "";
    if (isToday) { var nm = stamp(a.now) - stamp(DATE + " 00:00"); if (nm >= lo && nm <= hi) nowLine = "<i class='tl-now' style='top:" + (32 + (nm - lo) * PX) + "px'></i>"; }
    return "<div class='tl' style='--hp:" + (60 * PX) + "px' role='group' aria-label='Agenda del día'><div class='tl-axis'><div class='tl-h'></div><div class='tl-body' style='height:" + H + "px'>" + axis + "</div></div>" + cols + nowLine + "</div>";
  }

  function listView(list, a) {
    if (!list.length) return "<p class='bx-small'>Sin citas este día.</p>";
    return list.map(function (b) {
      return "<button type='button' class='item ag-li' data-b='" + b.id + "'><div><b>" + esc(b.start_at.slice(11)) + "–" + esc(b.end_at.slice(11)) + " · " + esc(b.name) + "</b> <span class='tag " + b.status + "'>" + STATE[b.status] + "</span>" +
        (b.pay_status === "paid" ? " <span class='tag done'>Pagado</span>" : "") + "<small>" + esc(b.service_name) + " · " + esc(b.barber) + " · " + esc(b.phone) + (b.cnote ? " · 📝 " + esc(b.cnote) : "") + "</small></div><span aria-hidden='true'>›</span></button>";
    }).join("");
  }

  function wireAgenda(v, a, c) {
    var go = function (d) { DATE = d; show(); };
    $("#pv").onclick = function () { go(addDays(DATE, -1)); }; $("#nx").onclick = function () { go(addDays(DATE, 1)); }; $("#td").onclick = function () { go(madridDay()); };
    $("#dt").onchange = function (e) { if (e.target.value) go(e.target.value); };
    $$("[data-f]", v).forEach(function (b) { b.onclick = function () { FILT = b.dataset.f; store.ses("bbfilt", FILT); store.loc("bbfilt", FILT); draw(v, a, c); }; });
    $("#vw").onclick = function () { VIEW = VIEW === "list" ? "line" : "list"; store.loc("bbview", VIEW); draw(v, a, c); };
    $("#nw").onclick = function () { newBooking(a, c, {}); }; $("#bk").onclick = function () { newBlock(a, c); };
    wireSpan(v); var wl = $("#wl", v); if (wl) wl.onclick = function () { waitSheet(a.waitlist, a); };
    $$("[data-b]", v).forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); var bk = a.bookings.filter(function (x) { return x.id === Number(b.dataset.b); })[0]; if (bk) detail(bk, a, c); }; });
    $$("[data-k]", v).forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); var k = a.blocks.filter(function (x) { return x.id === Number(b.dataset.k); })[0]; if (k) blockInfo(k, a); }; });
    $$(".tl-col", v).forEach(function (col) {
      var body = $(".tl-body", col);
      body.onclick = function (e) {
        var y = e.clientY - body.getBoundingClientRect().top, step = Number(c.rules.stepMin) || 30, m = Math.floor((Number(body.dataset.lo) + y / 1.55) / step) * step;
        newBooking(a, c, { barber: Number(col.dataset.bar), time: hhmm(Math.max(0, Math.min(m, 23 * 60 + 45))) });
      };
    });
    var tl = $(".tl", v);
    if (tl) {
      tl.dataset.d = DATE;
      if (KEEP != null) tl.scrollTop = KEEP;
      else {
        // Primera vez: se coloca en la próxima cita pendiente (o en la hora actual)
        var pend = $$(".tl-b.s-booked", tl).map(function (x) { return parseFloat(x.style.top); }).sort(function (p, q) { return p - q; });
        var nl = $(".tl-now", tl), nowTop = nl ? parseFloat(nl.style.top) - 32 : -1;
        var target = pend.filter(function (t) { return t >= nowTop - 45; })[0];
        if (target == null) target = nl ? nowTop : pend[0];
        if (target != null) tl.scrollTop = Math.max(0, target - 20);
      }
    }
  }

  /* ---- Día / Semana ---- */
  function spanToggle() {
    return "<span class='seg' role='group' aria-label='Vista'><button type='button' data-span='day' aria-pressed='" + (SPAN === "day") + "'>Día</button><button type='button' data-span='week' aria-pressed='" + (SPAN === "week") + "'>Semana</button></span> ";
  }
  function wireSpan(v) {
    $$("[data-span]", v).forEach(function (b) { b.onclick = function () { SPAN = b.dataset.span; store.loc("bbspan", SPAN); show(); }; });
  }
  function drawWeek(v, w, c) {
    var days = []; for (var i = 0; i < 7; i++) days.push(addDays(w.from, i));
    var today = w.now.slice(0, 10), bars = visibleBarbers(w), ids = bars.map(function (b) { return b.id; });
    var chips = "<button type='button' class='bx-chip' data-f='all' aria-pressed='" + (FILT === "all") + "'>Todos</button>" + w.barbers.map(function (b) {
      return "<button type='button' class='bx-chip' data-f='" + b.id + "' aria-pressed='" + (String(b.id) === FILT) + "'>" + esc(b.name) + (ME.barberId === b.id ? " (yo)" : "") + "</button>";
    }).join("");
    var waits = {}; (w.waits || []).forEach(function (x) { waits[x.day] = x.n; });
    var head = "<div class='ag-head'><div class='ag-nav'><button class='bx-ghost' id='pv' aria-label='Semana anterior'>←</button><span class='ag-range'>" + esc(longDate(days[0])) + " – " + esc(longDate(days[6])) + "</span><button class='bx-ghost' id='nx' aria-label='Semana siguiente'>→</button><button class='bx-ghost' id='td'>Hoy</button></div>" +
      "<div class='ag-day'>" + spanToggle() + "</div></div>" +
      "<div class='ag-tools'><div class='ag-chips' role='group' aria-label='Barbero'>" + chips + "</div><div class='ag-btns'><button class='bx-ghost' id='fx'>Bloqueos fijos</button></div></div>";
    var cards = days.map(function (d) {
      var wd = new Date(d + "T00:00:00Z").getUTCDay(), wins = c.hours[wd] || [];
      var total = 0; wins.forEach(function (x) { total += toMin(x[1]) - toMin(x[0]); });
      var cap = total * bars.length;
      var bk = w.bookings.filter(function (b) { return b.start_at.slice(0, 10) === d && b.status !== "cancelled" && ids.indexOf(b.barber_id) >= 0; });
      var busy = 0; bk.forEach(function (b) { busy += toMin(b.end_at.slice(11)) - toMin(b.start_at.slice(11)); });
      w.blocks.forEach(function (k) { if (k.start_at.slice(0, 10) !== d) return; bars.forEach(function (br) { if (k.barber_id == null || k.barber_id === br.id) busy += Math.max(0, toMin(k.end_at.slice(11)) - toMin(k.start_at.slice(11))); }); });
      var pct = cap ? Math.min(100, Math.round(busy * 100 / cap)) : 0, pend = bk.filter(function (b) { return b.status === "booked"; });
      var first = pend.slice(0, 3).map(function (b) { return esc(b.start_at.slice(11)) + " " + esc(b.name.split(" ")[0]); }).join(" · ");
      var closed = !wins.length;
      return "<button type='button' class='wk-day" + (d === today ? " today" : "") + (closed ? " closed" : "") + "' data-day='" + d + "' aria-label='" + esc(longDate(d)) + ": " + bk.length + " citas'>" +
        "<div class='wk-top'><b>" + esc(DAYS[wd].slice(0, 3)) + " " + Number(d.slice(8)) + "</b>" + (d === today ? "<span class='tag'>hoy</span>" : "") + (waits[d] ? "<span class='tag noshow'>⏳ " + waits[d] + "</span>" : "") + "</div>" +
        (closed ? "<small>Cerrado</small>" : "<div class='wk-bar' aria-hidden='true'><i style='width:" + pct + "%' class='" + (pct >= 85 ? "full" : "") + "'></i></div><small>" + bk.length + (bk.length === 1 ? " cita" : " citas") + " · " + pct + "% ocupado" + (pend.length && d >= today ? " · " + pend.length + " por hacer" : "") + "</small>" + (first ? "<small class='wk-first'>" + first + (pend.length > 3 ? " …" : "") + "</small>" : "")) + "</button>";
    }).join("");
    v.innerHTML = head + "<div class='wk'>" + cards + "</div><p class='bx-small ag-foot'>Toca un día para ver sus horas. La barra muestra lo ocupado (citas y bloqueos) sobre el horario del local.</p>";
    var go = function (d) { DATE = d; show(); };
    $("#pv").onclick = function () { go(addDays(w.from, -7)); }; $("#nx").onclick = function () { go(addDays(w.from, 7)); }; $("#td").onclick = function () { go(madridDay()); };
    $$("[data-f]", v).forEach(function (b) { b.onclick = function () { FILT = b.dataset.f; store.ses("bbfilt", FILT); store.loc("bbfilt", FILT); drawWeek(v, w, c); }; });
    $$("[data-day]", v).forEach(function (b) { b.onclick = function () { DATE = b.dataset.day; SPAN = "day"; store.loc("bbspan", "day"); show(); }; });
    $("#fx").onclick = function () { fixedSheet(w); };
    wireSpan(v);
  }

  /* ---- bloqueos fijos ---- */
  var WD = [["1", "L"], ["2", "M"], ["3", "X"], ["4", "J"], ["5", "V"], ["6", "S"], ["0", "D"]];
  function fixedSheet(a) {
    api("GET", "recurring").then(function (r) {
      var rows = r.rules.length ? r.rules.map(function (x) {
        var days = x.weekdays.split(",").map(function (n) { return DAYS[Number(n)].slice(0, 3); }).join(", "), can = isOwner() || x.barber_id === ME.barberId;
        return "<div class='item'><div><b>" + esc(x.note || "Bloqueado") + "</b><small>" + esc(days) + " · " + esc(x.start_time) + "–" + esc(x.end_time) + " · " + esc(x.barber || "Todo el local") + (x.until_date ? " · hasta " + esc(x.until_date) : "") + "</small></div>" + (can ? "<button class='bx-ghost' data-del='" + x.id + "'>Quitar</button>" : "") + "</div>";
      }).join("") : "<p class='bx-small'>Aún no hay bloqueos fijos. Úsalos para la comida, el día libre semanal, etc.</p>";
      sheet("<h3 class='sh-t'>Bloqueos fijos</h3><p class='bx-small'>Se repiten solos cada semana, sin tener que bloquear día a día.</p>" + rows + "<div class='acts' style='margin-top:.8rem'><button class='bx-btn' id='fn'>＋ Nuevo bloqueo fijo</button><button class='bx-ghost' id='sx'>Cerrar</button></div><p id='sm' class='bx-msg' role='status'></p>", function (d) {
        $("#sx", d).onclick = function () { d.close(); };
        $("#fn", d).onclick = function () { d.close(); newBlock(a, null, true); };
        $$("[data-del]", d).forEach(function (b) { b.onclick = function () { if (!confirm("¿Quitar este bloqueo fijo? Se liberan todos sus días futuros.")) return; api("POST", "recurring/del", { id: Number(b.dataset.del) }).then(function () { d.close(); toast("Bloqueo fijo quitado."); show(); }).catch(function (e) { $("#sm", d).className = "bx-msg err"; $("#sm", d).textContent = e.message; }); }; });
      });
    }).catch(function (e) { toast(e.message, true); });
  }

  /* ---- lista de espera ---- */
  function waitSheet(items, a) {
    var rows = items.map(function (w) {
      var bn = w.barber_id ? ((a.barbers.filter(function (b) { return b.id === w.barber_id; })[0] || {}).name || "") : "";
      return "<div class='item'><div><b>" + esc(w.name) + "</b><small>" + esc(w.service) + (bn ? " · con " + esc(bn) : " · cualquier barbero") + " · " + esc(w.phone) + "</small></div>" +
        "<div class='acts'><a class='bx-ghost' href='tel:" + esc(w.phone) + "' aria-label='Llamar'>📞</a><a class='bx-ghost' href='" + esc(waLink(w.phone, "Hola " + w.name.split(" ")[0] + ", se ha liberado un hueco en la barbería. ¿Te viene bien?")) + "' target='_blank' rel='noopener' aria-label='WhatsApp'>💬</a><button class='bx-ghost' data-rm='" + w.id + "'>Quitar</button></div></div>";
    }).join("") || "<p class='bx-small'>Nadie espera.</p>";
    sheet("<h3 class='sh-t'>Lista de espera</h3><p class='bx-small'>Clientes que querían este día y estaba lleno. Si se libera un hueco, la web avisa sola por correo a los dos primeros; tú también puedes llamarles.</p>" + rows + "<p id='sm' class='bx-msg' role='status'></p><button class='bx-ghost' id='sx' style='width:100%;margin-top:.4rem'>Cerrar</button>", function (d) {
      $("#sx", d).onclick = function () { d.close(); };
      $$("[data-rm]", d).forEach(function (b) { b.onclick = function () { api("POST", "waitlist/del", { id: Number(b.dataset.rm) }).then(function () { d.close(); show(); }).catch(function (e) { $("#sm", d).className = "bx-msg err"; $("#sm", d).textContent = e.message; }); }; });
    });
  }

  /* ---- detalle de una cita ---- */
  function detail(b, a, c) {
    var own = isOwner() || b.barber_id === ME.barberId, canMove = own;
    var hist = (b.visits ? b.visits + (b.visits === 1 ? " visita" : " visitas") : "Primera vez") + (b.noshows ? " · " + b.noshows + " no vino" : "") + (b.last_visit ? " · última: " + esc(longDate(b.last_visit.slice(0, 10))) : "");
    var acts = "";
    if (b.status === "booked" && own) acts += "<button class='bx-btn' data-a='done'>Realizada</button><button class='bx-ghost' data-a='noshow'>No vino</button><button class='bx-ghost' data-a='cancelled'>Cancelar cita</button>";
    else if (b.status !== "booked" && own) acts += "<button class='bx-ghost' data-a='booked'>Reabrir</button>";
    if (b.status === "booked" && !own) acts += "<button class='bx-btn' data-take='1'>Quedármela (cubrir a " + esc(b.barber) + ")</button>";
    if (isOwner() && b.pay_status === "paid") acts += "<button class='bx-ghost' data-refund='1'>Reembolsar</button>";
    var move = "";
    if (canMove && b.status === "booked") {
      move = "<h2>Mover o pasar a otro barbero</h2><div class='row'><div><label class='bx-lab' for='mvb'>Barbero</label><select id='mvb' class='bx-in'>" + a.barbers.map(function (x) { return "<option value='" + x.id + "'" + (x.id === b.barber_id ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select></div>" +
        "<div><label class='bx-lab' for='mvt'>Hora</label><input id='mvt' class='bx-in' type='time' step='300' value='" + esc(b.start_at.slice(11)) + "'></div><div><button class='bx-ghost' id='mvg' style='width:100%'>Mover</button></div></div><p class='bx-small'>Si cambias la hora, se avisa al cliente.</p>";
    }
    var html = "<h3 class='sh-t'>" + esc(b.start_at.slice(11)) + "–" + esc(b.end_at.slice(11)) + " · " + esc(b.name) + "</h3>" +
      "<p><span class='tag " + b.status + "'>" + STATE[b.status] + "</span>" + (b.pay_status === "paid" ? " <span class='tag done'>Pagado " + eur(b.pay_cents) + "</span>" : b.pay_status === "pending" && b.status === "booked" ? " <span class='tag noshow'>Pago pendiente</span>" : "") + (b.user_id ? " <span class='tag'>Socio del club</span>" : "") + "</p>" +
      "<p class='sh-l'>" + esc(b.service_name) + " · " + eur(b.price_cents) + "<br>Barbero: <b>" + esc(b.barber) + "</b> · " + esc(longDate(b.start_at.slice(0, 10))) + (b.source === "mostrador" ? " · creada en mostrador" : "") + "</p>" +
      (b.note ? "<p class='sh-l'>Corte pedido: " + esc(b.note) + "</p>" : "") +
      "<div class='acts sh-c'><a class='bx-btn' href='tel:" + esc(b.phone) + "'>📞 " + esc(b.phone) + "</a><a class='bx-ghost' href='" + esc(waLink(b.phone)) + "' target='_blank' rel='noopener'>💬 WhatsApp</a></div>" +
      (b.email ? "<p class='bx-small'>" + esc(b.email) + "</p>" : "") +
      "<p class='bx-small'>" + hist + (b.noshows >= 2 ? " · ⚠️ falla a menudo" : "") + "</p>" +
      "<label class='bx-lab' for='cn'>Nota del cliente (la ven todos los barberos)</label><textarea id='cn' class='bx-in' rows='2' maxlength='300' placeholder='Ej.: degradado del 2, sin tijera en las patillas'>" + esc(b.cnote || "") + "</textarea><button class='bx-ghost' id='cs' style='margin-top:.5rem'>Guardar nota</button>" +
      (acts ? "<h2>Acciones</h2><div class='acts sh-a'>" + acts + "</div>" : (!own ? "<p class='bx-small'>Esta cita es de " + esc(b.barber) + ".</p>" : "")) + move + "<p id='sm' class='bx-msg' role='status'></p><button class='bx-ghost' id='sx' style='width:100%;margin-top:.4rem'>Cerrar</button>";
    sheet(html, function (d) {
      var say = function (t) { var m = $("#sm", d); m.className = "bx-msg err"; m.textContent = t; };
      var done = function () { d.close(); show(); };
      $("#sx", d).onclick = function () { d.close(); };
      $("#cs", d).onclick = function () { api("POST", "note", { phone: b.phone, note: $("#cn", d).value }).then(function () { $("#sm", d).className = "bx-msg ok"; $("#sm", d).textContent = "Nota guardada."; a.bookings.forEach(function (x) { if (x.phone === b.phone) x.cnote = $("#cn", d).value; }); }).catch(function (e) { say(e.message); }); };
      $$("[data-a]", d).forEach(function (x) { x.onclick = function () { if (x.dataset.a === "cancelled" && !confirm("¿Cancelar la cita de " + b.name + "?")) return; api("POST", "status", { id: b.id, status: x.dataset.a }).then(done).catch(function (e) { say(e.message); }); }; });
      var tk = $("[data-take]", d); if (tk) tk.onclick = function () { api("POST", "move", { id: b.id, barber: ME.barberId }).then(function () { toast("Te has quedado la cita de " + b.name + "."); done(); }).catch(function (e) { say(e.message); }); };
      var rf = $("[data-refund]", d); if (rf) rf.onclick = function () { if (!confirm("¿Reembolsar el pago completo y cancelar la cita?")) return; api("POST", "refund", { id: b.id }).then(function () { toast("Reembolso hecho."); done(); }).catch(function (e) { say(e.message); }); };
      var mv = $("#mvg", d); if (mv) mv.onclick = function () { var body = { id: b.id, barber: Number($("#mvb", d).value) }, t = $("#mvt", d).value; if (t) body.start = b.start_at.slice(0, 10) + " " + t; api("POST", "move", body).then(function () { toast("Cita actualizada."); done(); }).catch(function (e) { say(e.message); }); };
    });
  }

  /* ---- nueva cita / bloqueo ---- */
  function newBooking(a, c, pre) {
    var bars = isOwner() ? a.barbers : a.barbers.filter(function (b) { return b.id === ME.barberId; });
    var html = "<h3 class='sh-t'>Nueva cita</h3><p class='bx-small'>Para clientes que llaman o vienen sin reservar por la web.</p>" +
      "<label class='bx-lab' for='nn'>Nombre</label><input id='nn' class='bx-in' autocomplete='off'><label class='bx-lab' for='np'>Teléfono</label><input id='np' class='bx-in' type='tel' inputmode='tel'>" +
      "<label class='bx-lab' for='ns'>Servicio</label><select id='ns' class='bx-in'>" + c.services.filter(function (s) { return s.active; }).map(function (s) { return "<option value='" + s.id + "'>" + esc(s.name) + " · " + s.minutes + " min · " + eur(s.price_cents) + "</option>"; }).join("") + "</select>" +
      "<div class='row'><div><label class='bx-lab' for='nb'>Barbero</label><select id='nb' class='bx-in'" + (bars.length === 1 ? " disabled" : "") + ">" + bars.map(function (b) { return "<option value='" + b.id + "'" + (b.id === (pre.barber || (ME.barberId || 0)) ? " selected" : "") + ">" + esc(b.name) + "</option>"; }).join("") + "</select></div>" +
      "<div><label class='bx-lab' for='nd'>Día</label><input id='nd' class='bx-in' type='date' value='" + DATE + "'></div><div><label class='bx-lab' for='nt'>Hora</label><input id='nt' class='bx-in' type='time' step='300' value='" + esc(pre.time || "") + "'></div></div>" +
      "<p id='sm' class='bx-msg' role='status'></p><div class='acts'><button class='bx-btn' id='nok'>Crear cita</button><button class='bx-ghost' id='sx'>Cancelar</button></div>";
    sheet(html, function (d) {
      $("#sx", d).onclick = function () { d.close(); };
      $("#nok", d).onclick = function () {
        var m = $("#sm", d); if (!$("#nt", d).value) { m.className = "bx-msg err"; m.textContent = "Elige la hora."; return; }
        api("POST", "book", { name: $("#nn", d).value, phone: $("#np", d).value, service: Number($("#ns", d).value), barber: Number($("#nb", d).value), start: $("#nd", d).value + " " + $("#nt", d).value })
          .then(function () { DATE = $("#nd", d).value; d.close(); toast("Cita creada."); show(); }).catch(function (e) { m.className = "bx-msg err"; m.textContent = e.message; });
      };
      $("#nn", d).focus();
    });
  }
  function wdPicker(on) {
    return "<p class='bx-lab'>Días de la semana</p><div class='wdays' role='group' aria-label='Días'>" + WD.map(function (x) { return "<button type='button' class='bx-chip' data-wd='" + x[0] + "' aria-pressed='" + (x[0] === on) + "'>" + x[1] + "</button>"; }).join("") + "</div><label class='bx-lab' for='bu'>Hasta (opcional)</label><input id='bu' class='bx-in' type='date'>";
  }
  function newBlock(a, c, repeat) {
    var wdOn = String(new Date(DATE + "T00:00:00Z").getUTCDay());
    var html = "<h3 class='sh-t'>" + (repeat ? "Bloqueo fijo semanal" : "Bloquear horas") + "</h3><p class='bx-small'>" + (repeat ? "Se repite solo cada semana (se crean los próximos 3 meses y se va renovando)." : "Nadie podrá reservar ese rato (descanso, médico, vacaciones…).") + "</p>" +
      "<div class='row'><div><label class='bx-lab' for='bf'>Desde</label><input id='bf' class='bx-in' type='time' step='300'></div><div><label class='bx-lab' for='bt'>Hasta</label><input id='bt' class='bx-in' type='time' step='300'></div></div>" +
      (isOwner() ? "<label class='bx-lab' for='bb'>Barbero</label><select id='bb' class='bx-in'><option value=''>Todos</option>" + a.barbers.map(function (b) { return "<option value='" + b.id + "'>" + esc(b.name) + "</option>"; }).join("") + "</select>" : "") +
      "<label class='bx-lab' for='bn'>Motivo</label><input id='bn' class='bx-in' maxlength='60' placeholder='Médico, comida, vacaciones…'>" +
      (repeat ? wdPicker(wdOn) : "<label class='bx-chk'><input type='checkbox' id='br'> Repetir cada semana</label><div id='brw' hidden>" + wdPicker(wdOn) + "</div>") +
      "<p id='sm' class='bx-msg' role='status'></p><div class='acts'><button class='bx-btn' id='bok'>" + (repeat ? "Crear bloqueo fijo" : "Bloquear") + "</button><button class='bx-ghost' id='sx'>Cancelar</button></div>";
    sheet(html, function (d) {
      var rpt = !!repeat;
      $("#sx", d).onclick = function () { d.close(); };
      $$("[data-wd]", d).forEach(function (b) { b.onclick = function () { b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")); }; });
      var br = $("#br", d); if (br) br.onchange = function () { rpt = br.checked; $("#brw", d).hidden = !rpt; };
      $("#bok", d).onclick = function () {
        var m = $("#sm", d); if (!$("#bf", d).value || !$("#bt", d).value) { m.className = "bx-msg err"; m.textContent = "Indica desde y hasta."; return; }
        var barber = isOwner() ? (Number($("#bb", d).value) || null) : undefined, note = $("#bn", d).value, p;
        if (rpt) {
          var wds = $$("[data-wd]", d).filter(function (b) { return b.getAttribute("aria-pressed") === "true"; }).map(function (b) { return Number(b.dataset.wd); });
          if (!wds.length) { m.className = "bx-msg err"; m.textContent = "Elige al menos un día de la semana."; return; }
          p = api("POST", "recurring", { weekdays: wds, start: $("#bf", d).value, end: $("#bt", d).value, barber: barber || 0, note: note, from: DATE, until: $("#bu", d).value || undefined });
        } else p = api("POST", "block", { start: DATE + " " + $("#bf", d).value, end: DATE + " " + $("#bt", d).value, barber: barber, note: note });
        p.then(function (r) { d.close(); toast(rpt ? "Bloqueo fijo creado." + (r.conflicts ? " Ojo: " + r.conflicts + (r.conflicts === 1 ? " cita ya reservada cae" : " citas ya reservadas caen") + " dentro; no se han tocado." : "") : "Horas bloqueadas."); show(); })
          .catch(function (e) { m.className = "bx-msg err"; m.textContent = e.message; });
      };
    });
  }
  function blockInfo(k, a) {
    var who = k.barber_id == null ? "Todos los barberos" : (a.barbers.filter(function (b) { return b.id === k.barber_id; })[0] || { name: "Barbero" }).name, can = isOwner() || k.barber_id === ME.barberId;
    sheet("<h3 class='sh-t'>⛔ " + esc(k.note || "Bloqueado") + "</h3><p class='sh-l'>" + esc(k.start_at.slice(11)) + " → " + esc(k.end_at.slice(11)) + " · " + esc(who) + (k.rule_id ? " · se repite cada semana" : "") + "</p><p id='sm' class='bx-msg' role='status'></p><div class='acts'>" + (can ? "<button class='bx-btn' id='ub'>" + (k.rule_id ? "Quitar solo este día" : "Quitar bloqueo") + "</button>" + (k.rule_id ? "<button class='bx-ghost' id='ua'>Quitar toda la serie</button>" : "") : "") + "<button class='bx-ghost' id='sx'>Cerrar</button></div>", function (d) {
      $("#sx", d).onclick = function () { d.close(); };
      var ua = $("#ua", d); if (ua) ua.onclick = function () { if (!confirm("¿Quitar este bloqueo fijo de todos los días futuros?")) return; api("POST", "unblock", { id: k.id, all: true }).then(function () { d.close(); show(); }).catch(function (e) { $("#sm", d).className = "bx-msg err"; $("#sm", d).textContent = e.message; }); };
      var u = $("#ub", d); if (u) u.onclick = function () { api("POST", "unblock", { id: k.id }).then(function () { d.close(); show(); }).catch(function (e) { $("#sm", d).className = "bx-msg err"; $("#sm", d).textContent = e.message; }); };
    });
  }

  /* ---------- RESUMEN (solo jefe) ---------- */
  function bars(rows, key, label, fmt, max) {
    if (!rows.length) return "<p class='bx-small'>Sin datos todavía.</p>";
    var top = max || Math.max.apply(null, rows.map(function (r) { return r[key]; }).concat([1]));
    return "<div class='bars'>" + rows.map(function (r) { return "<div class='bar-r'><span class='bar-l'>" + esc(label(r)) + "</span><span class='bar-t'><i style='width:" + Math.max(2, Math.round(r[key] / top * 100)) + "%'></i></span><span class='bar-v'>" + fmt(r[key]) + "</span></div>"; }).join("") + "</div>";
  }
  function resumen(v) {
    return api("GET", "stats").then(function (s) {
      var days = []; for (var i = 13; i >= 0; i--) { var d = addDays(madridDay(), -i), f = (s.byDay || []).filter(function (x) { return x.d === d; })[0]; days.push({ d: d, revenue: f ? f.revenue : 0, done: f ? f.done : 0 }); }
      var td = s.today || {};
      var html = "<h2>Hoy</h2><div class='stats'><div class='stat'><b>" + (td.total || 0) + "</b>citas</div><div class='stat'><b>" + (td.done || 0) + "</b>hechas</div><div class='stat'><b>" + (td.pending || 0) + "</b>por hacer</div><div class='stat'><b>" + eur(td.revenue || 0) + "</b>cobrado (hechas)</div><div class='stat'><b>" + eur(td.expected || 0) + "</b>previsto del día</div></div>" +
        "<h2>Últimos 30 días</h2><div class='stats'><div class='stat'><b>" + s.total + "</b>citas</div><div class='stat'><b>" + (s.done || 0) + "</b>realizadas</div><div class='stat'><b>" + (s.noshow || 0) + "</b>no vinieron</div><div class='stat'><b>" + (s.cancelled || 0) + "</b>canceladas</div><div class='stat'><b>" + eur(s.revenue || 0) + "</b>facturado</div><div class='stat'><b>" + eur(s.paidOnline || 0) + "</b>cobrado por la web</div><div class='stat'><b>" + s.clients + "</b>socios del club</div></div>" +
        "<h2>Ingresos por día (14 días)</h2>" + bars(days, "revenue", function (r) { return longDate(r.d).replace(/^\S+ /, ""); }, eur) +
        "<h2>Por barbero (30 días)</h2>" + ((s.byBarber || []).length ? "<div class='tbl'><table><thead><tr><th>Barbero</th><th>Citas</th><th>Hechas</th><th>No vino</th><th>Facturado</th></tr></thead><tbody>" + s.byBarber.map(function (b) { return "<tr><td>" + esc(b.name) + "</td><td>" + b.total + "</td><td>" + (b.done || 0) + "</td><td>" + (b.noshow || 0) + "</td><td>" + eur(b.revenue) + "</td></tr>"; }).join("") + "</tbody></table></div>" : "<p class='bx-small'>Sin datos todavía.</p>") +
        "<h2>Servicios más pedidos</h2>" + bars(s.byService || [], "n", function (r) { return r.name; }, function (n) { return n; }) +
        "<h2>Horas más pedidas</h2>" + bars(s.byHour || [], "n", function (r) { return r.h + ":00"; }, function (n) { return n; }) +
        "<h2>Descargar citas (Excel / gestoría)</h2><div class='row'><div><label class='bx-lab' for='xr'>Periodo</label><select id='xr' class='bx-in'><option value='30'>Últimos 30 días</option><option value='month'>Este mes</option><option value='prev'>Mes pasado</option><option value='90'>Últimos 90 días</option></select></div><div><button class='bx-btn' id='xd' style='width:100%'>Descargar CSV</button></div></div><p id='xm' class='bx-msg' role='status'></p>";
      v.innerHTML = html;
      $("#xd").onclick = function () {
        var t = madridDay(), r = $("#xr").value, from, to = t;
        if (r === "month") from = t.slice(0, 8) + "01"; else if (r === "prev") { var o = new Date(t.slice(0, 8) + "01T00:00:00Z"); o.setUTCDate(0); to = o.toISOString().slice(0, 10); from = to.slice(0, 8) + "01"; } else from = addDays(t, -(Number(r) - 1));
        fetch("/api/admin/export?from=" + from + "&to=" + to, { headers: { "x-admin-token": TOKEN } }).then(function (res) { if (!res.ok) throw new Error("No se pudo descargar."); return res.blob(); }).then(function (bl) {
          var a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = "citas-" + from + "-a-" + to + ".csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
          $("#xm").className = "bx-msg ok"; $("#xm").textContent = "Descargado. Ábrelo con Excel.";
        }).catch(function (e) { $("#xm").className = "bx-msg err"; $("#xm").textContent = e.message; });
      };
    });
  }

  /* ---------- EQUIPO (solo jefe) ---------- */
  function equipo(v) {
    return Promise.all([api("GET", "team"), api("GET", "audit")]).then(function (r) {
      var team = r[0].team, log = r[1].items;
      v.innerHTML = "<h2>Equipo</h2><p class='bx-small'>Tú (jefe) entras con la contraseña del panel y lo ves todo. Cada barbero entra con <b>su propia clave</b>: ve la agenda de todos para cubrirse entre ellos, gestiona la suya y no ve ingresos, precios ni ajustes. Si alguien se va, retira su acceso y listo.</p>" +
        team.map(function (t) {
          return "<div class='item' data-id='" + t.id + "'><div><b>" + esc(t.name) + "</b> " + (t.active ? "" : "<span class='tag cancelled'>Inactivo</span>") + " " + (t.has_key ? "<span class='tag done'>Con acceso</span>" : "<span class='tag'>Sin acceso</span>") +
            "<small>" + (t.has_key ? (t.last_seen ? "Último acceso: " + esc(t.last_seen) : "Aún no ha entrado") + " · avisos en " + t.devices + " móvil" + (t.devices === 1 ? "" : "es") : "Crea su acceso para que use la app") + "</small></div>" +
            "<div class='acts'><button class='bx-btn' data-key='" + t.id + "'>" + (t.has_key ? "Nueva clave" : "Crear acceso") + "</button>" + (t.has_key ? "<button class='bx-ghost' data-rev='" + t.id + "'>Retirar acceso</button>" : "") + "</div></div>";
        }).join("") +
        "<p class='bx-small'>Para añadir o renombrar barberos ve a <b>Ajustes → Barberos</b>.</p>" +
        "<h2>Actividad reciente</h2>" + (log.length ? "<div class='tbl'><table><tbody>" + log.slice(0, 40).map(function (l) { return "<tr><td class='nw'>" + esc(l.ts.slice(5)) + "</td><td><b>" + esc(l.actor) + "</b></td><td>" + esc(l.action) + "</td><td>" + esc(l.detail) + "</td></tr>"; }).join("") + "</tbody></table></div>" : "<p class='bx-small'>Todavía no hay actividad.</p>");
      $$("[data-key]", v).forEach(function (b) { b.onclick = function () {
        var t = team.filter(function (x) { return x.id === Number(b.dataset.key); })[0];
        if (t.has_key && !confirm("La clave anterior de " + t.name + " dejará de funcionar y se quitarán sus avisos. ¿Continuar?")) return;
        api("POST", "team/key", { barberId: t.id }).then(function (k) { showKey(k, v); }).catch(function (e) { alert(e.message); });
      }; });
      $$("[data-rev]", v).forEach(function (b) { b.onclick = function () { var t = team.filter(function (x) { return x.id === Number(b.dataset.rev); })[0]; if (!confirm("¿Retirar el acceso de " + t.name + "? Dejará de entrar y de recibir avisos.")) return; api("POST", "team/revoke", { barberId: t.id }).then(function () { show(); }).catch(function (e) { alert(e.message); }); }; });
    });
  }
  function showKey(k) {
    var link = location.origin + "/admin.html#k=" + k.key, text = "Hola " + k.name + ", este es tu acceso a la agenda de la barbería: " + link + "\n\nÁbrelo en tu móvil, entra y pulsa «Instalar la app». Después activa los avisos de citas.";
    sheet("<h3 class='sh-t'>Acceso de " + esc(k.name) + "</h3><p class='sh-l'>Envíale este enlace: al abrirlo entra directamente. <b>Solo se muestra ahora</b>; si lo pierdes, crea una clave nueva.</p>" +
      "<label class='bx-lab' for='kl'>Enlace de acceso</label><input id='kl' class='bx-in' readonly value='" + esc(link) + "'><label class='bx-lab' for='kk'>Clave (por si prefiere escribirla)</label><input id='kk' class='bx-in' readonly value='" + esc(k.key) + "'>" +
      "<p id='sm' class='bx-msg' role='status'></p><div class='acts'><a class='bx-btn' href='https://wa.me/?text=" + encodeURIComponent(text) + "' target='_blank' rel='noopener'>Enviar por WhatsApp</a><button class='bx-ghost' id='cp'>Copiar enlace</button><button class='bx-ghost' id='sx'>Hecho</button></div>", function (d) {
      $("#sx", d).onclick = function () { d.close(); show(); };
      $("#cp", d).onclick = function () { var i = $("#kl", d); i.select(); (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).catch(function () { document.execCommand("copy"); }).then(function () { $("#sm", d).className = "bx-msg ok"; $("#sm", d).textContent = "Enlace copiado."; }); };
    });
  }

  /* ---------- AVISOS WHATSAPP ---------- */
  function avisos(v) {
    var d = addDays(madridDay(), 1);
    return api("GET", "reminders?date=" + d).then(function (r) {
      v.innerHTML = "<h2>Citas de mañana (" + esc(r.date) + ")</h2><p class='bx-small'>Los clientes con correo reciben el aviso solos (24 h y 2 h antes). Aquí tienes el botón de WhatsApp para quien prefiera o no dejó correo: se abre WhatsApp con el mensaje escrito.</p>" +
        (r.items.length ? r.items.map(function (i) { return "<div class='item'><div><b>" + esc(i.start_at.slice(11)) + " · " + esc(i.name) + "</b><small>" + esc(i.service_name) + " · " + esc(i.phone) + "</small></div><a class='bx-btn' href='" + esc(i.link) + "' target='_blank' rel='noopener'>Avisar por WhatsApp</a></div>"; }).join("") : "<p class='bx-small'>No hay citas mañana.</p>");
    });
  }

  /* ---------- CLIENTES ---------- */
  function clientes(v) {
    var own = isOwner();
    v.innerHTML = "<div class='bar'><input id='q' class='bx-in' style='max-width:320px;margin:0' placeholder='Buscar nombre" + (own ? ", correo" : "") + " o teléfono' aria-label='Buscar cliente'><button class='bx-ghost' id='qs'>Buscar</button></div>" + (own ? "" : "<p class='bx-small'>Consulta de clientes y puntos del club. Los ajustes de puntos los hace el jefe.</p>") + "<div id='cl'></div>";
    function load() {
      return api("GET", "clients?q=" + encodeURIComponent($("#q").value)).then(function (r) {
        $("#cl").innerHTML = r.clients.length ? r.clients.map(function (c) {
          return "<div class='item'><div><b>" + esc(c.name) + "</b> <span class='tag'>" + c.points + " pts</span><small>" + (c.email ? esc(c.email) + " · " : "") + (c.phone ? esc(c.phone) + " · " : "") + c.visits + " visitas" + (c.noshows ? " · " + c.noshows + " no vino" : "") + "</small></div>" +
            "<div class='acts'>" + (c.phone ? "<a class='bx-ghost' href='tel:" + esc(c.phone) + "'>📞</a><a class='bx-ghost' target='_blank' rel='noopener' href='" + esc(waLink(c.phone)) + "'>💬</a>" : "") + (own ? "<button class='bx-ghost' data-p='" + c.id + "' data-d='10'>+10</button><button class='bx-ghost' data-p='" + c.id + "' data-d='-10'>−10</button><button class='bx-ghost' data-pc='" + c.id + "'>Otro…</button>" : "") + "</div></div>";
        }).join("") : "<p class='bx-small'>Sin resultados.</p>";
        $$("#cl [data-p]").forEach(function (b) { b.onclick = function () { api("POST", "points", { userId: Number(b.dataset.p), delta: Number(b.dataset.d), reason: "Ajuste del local" }).then(load); }; });
        $$("#cl [data-pc]").forEach(function (b) { b.onclick = function () { var n = prompt("Puntos a sumar (negativo para restar):"); if (!n) return; api("POST", "points", { userId: Number(b.dataset.pc), delta: Number(n), reason: prompt("Motivo:") || "Ajuste del local" }).then(load).catch(function (e) { alert(e.message); }); }; });
      });
    }
    $("#qs").onclick = load; $("#q").onkeydown = function (e) { if (e.key === "Enter") load(); };
    return load();
  }

  /* ---------- CANJES ---------- */
  function canjes(v) {
    return api("GET", "redemptions").then(function (r) {
      v.innerHTML = "<h2>Premios canjeados</h2><p class='bx-small'>El cliente te enseña su código; pulsa «Entregado» al darle el premio.</p>" + (r.redemptions.length ? r.redemptions.map(function (x) {
        return "<div class='item'><div><b>" + esc(x.reward_name) + "</b> <span class='tag'>" + (x.status === "open" ? "pendiente" : "entregado") + "</span><small>" + esc(x.name) + (x.phone ? " · " + esc(x.phone) : "") + " · " + esc(x.created_at) + "</small></div><div class='acts'><span class='cx-code'>" + esc(x.code) + "</span>" + (x.status === "open" ? "<button class='bx-btn' data-u='" + x.id + "'>Entregado</button>" : "") + "</div></div>";
      }).join("") : "<p class='bx-small'>Nada por ahora.</p>");
      $$("[data-u]", v).forEach(function (b) { b.onclick = function () { api("POST", "redemption-use", { id: Number(b.dataset.u) }).then(function () { show(); }); }; });
    });
  }

  /* ---------- AJUSTES (solo jefe) ---------- */
  function ajustes(v) {
    CAT = null;
    return Promise.all([catalog(), api("GET", "pay")]).then(function (rr) {
      var c = rr[0], pay = rr[1], days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"], order = [1, 2, 3, 4, 5, 6, 0];
      v.innerHTML = "<h2>Servicios</h2>" + c.services.map(function (s) { return "<div class='row item' data-svc='" + s.id + "'><div><label class='bx-lab'>Nombre</label><input class='bx-in' data-k='name' value='" + esc(s.name) + "'></div><div><label class='bx-lab'>Minutos</label><input class='bx-in' data-k='minutes' type='number' value='" + s.minutes + "'></div><div><label class='bx-lab'>Precio €</label><input class='bx-in' data-k='price' value='" + (s.price_cents / 100) + "'></div><div><label class='bx-lab'>Visible</label><select class='bx-in' data-k='active'><option value='1'" + (s.active ? " selected" : "") + ">Sí</option><option value='0'" + (s.active ? "" : " selected") + ">No</option></select></div><button class='bx-btn' data-save='svc'>Guardar</button></div>"; }).join("") +
        "<div class='row item' data-svc=''><div><input class='bx-in' data-k='name' placeholder='Nuevo servicio'></div><div><input class='bx-in' data-k='minutes' type='number' placeholder='min'></div><div><input class='bx-in' data-k='price' placeholder='€'></div><div></div><button class='bx-ghost' data-save='svc'>Añadir</button></div>" +
        "<h2>Barberos</h2><p class='bx-small'>Los que están «Activos» aparecen para reservar en la web. El acceso de cada uno a esta app se gestiona en la pestaña <b>Equipo</b>.</p>" + c.barbers.map(function (s) { return "<div class='row item' data-bar='" + s.id + "'><div><input class='bx-in' data-k='name' value='" + esc(s.name) + "'></div><div><select class='bx-in' data-k='active'><option value='1'" + (s.active ? " selected" : "") + ">Activo</option><option value='0'" + (s.active ? "" : " selected") + ">Inactivo</option></select></div><button class='bx-btn' data-save='bar'>Guardar</button></div>"; }).join("") +
        "<div class='row item' data-bar=''><div><input class='bx-in' data-k='name' placeholder='Nuevo barbero'></div><div></div><button class='bx-ghost' data-save='bar'>Añadir</button></div>" +
        "<h2>Premios del club</h2>" + c.rewards.map(function (s) { return "<div class='row item' data-rw='" + s.id + "'><div><input class='bx-in' data-k='name' value='" + esc(s.name) + "'></div><div><input class='bx-in' data-k='cost' type='number' value='" + s.cost + "'></div><div><select class='bx-in' data-k='active'><option value='1'" + (s.active ? " selected" : "") + ">Activo</option><option value='0'" + (s.active ? "" : " selected") + ">Oculto</option></select></div><button class='bx-btn' data-save='rw'>Guardar</button></div>"; }).join("") +
        "<div class='row item' data-rw=''><div><input class='bx-in' data-k='name' placeholder='Nuevo premio'></div><div><input class='bx-in' data-k='cost' type='number' placeholder='puntos'></div><div></div><button class='bx-ghost' data-save='rw'>Añadir</button></div>" +
        "<h2>Horario (formato 10:00-14:00, 16:30-20:30; vacío = cerrado)</h2>" + order.map(function (d) { var w = (c.hours[d] || []).map(function (x) { return x[0] + "-" + x[1]; }).join(", "); return "<div class='row'><label class='bx-lab' style='margin:0'>" + days[d] + "</label><input class='bx-in' data-h='" + d + "' value='" + esc(w) + "' style='grid-column:span 2'></div>"; }).join("") + "<button class='bx-btn' id='sh'>Guardar horario</button>" +
        "<h2>Pagos online (Stripe)</h2>" + (pay.stripe ? "<p class='bx-small'>Stripe conectado" + (pay.live ? " en <b>modo real</b>." : " en <b>modo de pruebas</b> (no se cobra dinero real).") + "</p>" : "<p class='bx-small'>Stripe aún no está conectado: faltan las claves en Cloudflare (mira LEEME.md). Mientras tanto la web no pide pago.</p>") +
        "<div class='row'><div><label class='bx-lab'>Cómo se paga</label><select id='pm' class='bx-in'>" + [["off", "Sin pago online (se paga en la barbería)"], ["optional", "El cliente elige: pagar ahora o en la barbería"], ["deposit", "Señal obligatoria para reservar"], ["full", "Pago completo obligatorio"]].map(function (o) { return "<option value='" + o[0] + "'" + (pay.mode === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></div><div><label class='bx-lab'>Importe de la señal (€)</label><input id='pd' class='bx-in' type='number' min='1' max='50' step='0.5' value='" + (pay.depositCents / 100) + "'></div></div><button class='bx-btn' id='sp'>Guardar pagos</button>" +
        "<h2>Reglas</h2><div class='row'>" + [["stepMin", "Intervalo entre citas (min)"], ["leadMin", "Antelación mínima (min)"], ["cancelMin", "Cancelar hasta (min antes)"], ["maxDays", "Días reservables"], ["pointsPerEuro", "Puntos por euro"], ["welcomePoints", "Puntos de bienvenida"], ["referralPoints", "Puntos por recomendar"]].map(function (k) { return "<div><label class='bx-lab'>" + k[1] + "</label><input class='bx-in' data-r='" + k[0] + "' type='number' value='" + c.rules[k[0]] + "'></div>"; }).join("") + "</div><button class='bx-btn' id='sr'>Guardar reglas</button>";
      function val(row, k) { var e = row.querySelector("[data-k=" + k + "]"); return e ? e.value : ""; }
      $$("[data-save]", v).forEach(function (b) { b.onclick = function () {
        var row = b.closest(".item"), t = b.dataset.save, body, path;
        if (t === "svc") { path = "service"; body = { id: Number(row.dataset.svc) || undefined, name: val(row, "name"), minutes: Number(val(row, "minutes")), price: val(row, "price"), active: val(row, "active") !== "0" }; }
        if (t === "bar") { path = "barber"; body = { id: Number(row.dataset.bar) || undefined, name: val(row, "name"), active: val(row, "active") !== "0" }; }
        if (t === "rw") { path = "reward"; body = { id: Number(row.dataset.rw) || undefined, name: val(row, "name"), cost: Number(val(row, "cost")), active: val(row, "active") !== "0" }; }
        api("POST", path, body).then(function () { CAT = null; show(); }).catch(function (e) { alert(e.message); });
      }; });
      $("#sh").onclick = function () { var h = {}; $$("[data-h]").forEach(function (i) { h[i.dataset.h] = i.value.split(",").map(function (p) { var m = p.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/); return m ? [m[1].padStart(2, "0") + ":" + m[2], m[3].padStart(2, "0") + ":" + m[4]] : null; }).filter(Boolean); }); api("POST", "hours", { hours: h }).then(function () { alert("Horario guardado"); CAT = null; }).catch(function (e) { alert(e.message); }); };
      $("#sp").onclick = function () { api("POST", "pay", { mode: $("#pm").value, depositCents: Math.round(Number($("#pd").value) * 100) }).then(function () { alert("Pagos guardados"); }).catch(function (e) { alert(e.message); }); };
      $("#sr").onclick = function () { var b = {}; $$("[data-r]").forEach(function (i) { b[i.dataset.r] = Number(i.value); }); api("POST", "rules", b).then(function () { alert("Reglas guardadas"); CAT = null; }).catch(function (e) { alert(e.message); }); };
    });
  }

  /* ---------- Avisos push de este móvil ---------- */
  function pushState() {
    var m = $("#pushmsg"), b = $("#pushbtn"), t = $("#pushtest"); if (!window.BBPWA) return;
    BBPWA.current().then(function (sub) {
      var on = !!sub && window.Notification && Notification.permission === "granted";
      b.textContent = on ? "🔕 Desactivar avisos" : "🔔 Activar avisos de citas"; b.dataset.on = on ? "1" : ""; t.hidden = !on;
      if (m.className.indexOf("ok") >= 0 || m.className.indexOf("err") >= 0) return;
      m.className = "bx-msg";
      m.textContent = on ? (isOwner() ? "Avisos activados en este móvil: te llegará cada cita nueva, cambio o cancelación." : "Avisos activados en este móvil: te llegarán tus citas nuevas, cambios y cancelaciones.")
        : (window.Notification && Notification.permission === "denied" ? "Las notificaciones están bloqueadas. Actívalas en los ajustes del móvil: mantén pulsado el icono de la app → Información de la app → Notificaciones → Permitir. Después vuelve aquí y pulsa Activar."
          : (BBPWA.ios && !BBPWA.standalone() ? "En iPhone: instala primero la app (Compartir → Añadir a pantalla de inicio) y ábrela desde el icono para activar los avisos." : ""));
    });
  }
  function askPush() {
    try { if (!window.BBPWA || !BBPWA.supported() || !window.Notification || Notification.permission !== "default") return; if (BBPWA.ios && !BBPWA.standalone()) return; if (localStorage.getItem("bbpa")) return; } catch (e) { return; }
    BBPWA.current().then(function (sub) {
      if (sub) return;
      var d = sheet("<h3 class='sh-t'>🔔 No te pierdas ninguna cita</h3><p class='sh-l'>Activa los avisos y te sonará el móvil cuando entre una cita nueva, cambie o se cancele, aunque tengas la app cerrada.</p><div class='acts'><button class='bx-btn' id='pa-y'>Activar avisos ahora</button><button class='bx-ghost' id='pa-n'>Más tarde</button></div>", function (d) {
        var fin = function () { try { localStorage.setItem("bbpa", String(Date.now())); } catch (e) {} d.close(); };
        $("#pa-y", d).onclick = function () { fin(); $("#pushbtn").click(); }; $("#pa-n", d).onclick = fin;
        d.addEventListener("cancel", function () { try { localStorage.setItem("bbpa", String(Date.now())); } catch (e) {} });
      });
    });
  }

  /* ---------- arranque ---------- */
  $("#lg").onclick = login; $("#tk").onkeydown = function (e) { if (e.key === "Enter") login(); };
  $("#out").onclick = logout;
  $("#pushbtn").onclick = function () {
    var b = this, m = $("#pushmsg"); if (!window.BBPWA) return; b.disabled = true; m.className = "bx-msg"; m.textContent = "";
    var op = b.dataset.on ? BBPWA.unsubscribe({ admin: true, token: TOKEN }) : BBPWA.subscribe({ admin: true, token: TOKEN });
    op.then(function () { b.disabled = false; pushState(); }).catch(function (e) { b.disabled = false; m.className = "bx-msg err"; m.textContent = e && e.friendly ? e.message : "No se pudo cambiar el aviso."; });
  };
  $("#pushtest").onclick = function () { api("POST", "push/test", {}).then(function () { toast("Enviado: en unos segundos debería sonar el aviso."); }).catch(function (e) { toast(e.message, true); }); };
  window.addEventListener("load", function () { setTimeout(pushState, 300); });
  document.addEventListener("visibilitychange", function () { if (!document.hidden && TOKEN && TAB === "agenda" && !$("#app").hidden && !document.querySelector("dialog[open]")) show(true); });

  // Enlace de acceso enviado por el jefe: /admin.html#k=<clave>
  var m = /^#k=([0-9a-f]{1,6}\.[0-9a-f-]{20,30})$/i.exec(location.hash || "");
  if (m) { TOKEN = m[1]; try { history.replaceState(null, "", location.pathname); } catch (e) {} enter(true).catch(function () { TOKEN = ""; $("#lm").textContent = "Ese enlace de acceso ya no es válido. Pide uno nuevo al jefe."; $("#lm").className = "bx-msg err"; }); }
  else { TOKEN = store.get("bbt"); if (TOKEN) enter(!!localStorage.getItem("bbt")).catch(function () { TOKEN = ""; }); }
})();
