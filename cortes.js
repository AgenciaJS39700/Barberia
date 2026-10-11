/* cortes.js · "Encuentra tu corte": galería (110 cortes), test, análisis de cara en el móvil y probador con IA. Se carga al acercarse a la sección. */
(function () {
"use strict";
var BB = window.BB, esc = BB.esc;
var $ = function (s, r) { return (r || document).querySelector(s); };

/* ---------------------------------------------------------------- catálogo */
var FACES = { ovalada: "Ovalada", redonda: "Redonda", cuadrada: "Cuadrada", alargada: "Alargada", corazon: "Corazón", diamante: "Diamante" };
var HAIRS = { liso: "Liso", ondulado: "Ondulado", rizado: "Rizado", afro: "Afro" };
var LENS = { corto: "Corto", medio: "Medio", largo: "Largo" };
var STYLES = { clasico: "Clásico", moderno: "Moderno", urbano: "Urbano", elegante: "Elegante", atrevido: "Atrevido" };
var ALL = ["ovalada", "redonda", "cuadrada", "alargada", "corazon", "diamante"];

// Laterales (cómo se trabaja el lado y la nuca)
var SIDES = {
  low: { n: "Low fade", t: "degradado bajo que arranca cerca de la oreja", boost: ["alargada", "ovalada", "cuadrada"], avoid: [] },
  mid: { n: "Mid fade", t: "degradado a media altura, el más pedido", boost: ["ovalada", "redonda", "cuadrada", "corazon"], avoid: [] },
  high: { n: "High fade", t: "degradado alto con contraste marcado", boost: ["redonda", "ovalada"], avoid: ["alargada"] },
  skin: { n: "Skin fade", t: "degradado que llega a piel, muy limpio", boost: ["cuadrada", "redonda", "ovalada"], avoid: [] },
  taper: { n: "Taper", t: "degradado suave y discreto en patillas y nuca", boost: ["ovalada", "alargada", "corazon", "diamante"], avoid: [] },
  burst: { n: "Burst fade", t: "degradado en curva alrededor de la oreja", boost: ["cuadrada", "ovalada"], avoid: [] },
  drop: { n: "Drop fade", t: "degradado que baja por detrás de la oreja", boost: ["ovalada", "redonda", "cuadrada"], avoid: [] },
  tijera: { n: "a tijera", t: "todo a tijera, sin degradar, aspecto natural", boost: ["alargada", "corazon", "diamante", "ovalada"], avoid: [] },
  under: { n: "Undercut", t: "laterales muy cortos y desconectados de la parte de arriba", boost: ["ovalada", "cuadrada", "diamante"], avoid: ["alargada"] }
};

// Parte de arriba: id, nombre, largo, tipos de pelo, caras que mejor le van, estilo, esfuerzo (1 poco, 3 mucho), texto, laterales posibles
var TOPS = [
  ["crop", "Crop texturizado", "corto", ["liso", "ondulado", "rizado"], ["ovalada", "cuadrada", "redonda", "corazon"], "moderno", 1, "Flequillo corto y texturizado hacia delante. Poco mantenimiento y le queda bien a casi todo el mundo.", ["low", "mid", "high", "skin", "taper", "burst", "tijera"]],
  ["french", "French crop", "corto", ["liso", "ondulado"], ["ovalada", "alargada", "diamante", "corazon"], "moderno", 1, "Flequillo recto y corto sobre la frente. Disimula una frente grande y se peina en 30 segundos.", ["low", "mid", "high", "skin", "taper", "drop"]],
  ["quiff", "Quiff", "medio", ["liso", "ondulado"], ["ovalada", "cuadrada", "redonda", "corazon"], "moderno", 3, "Volumen hacia arriba y atrás en la parte delantera. Estiliza la cara y da altura.", ["low", "mid", "high", "skin", "taper", "tijera", "under"]],
  ["pomp", "Pompadour", "medio", ["liso", "ondulado"], ["ovalada", "cuadrada", "redonda"], "elegante", 3, "Mucho volumen delante peinado hacia atrás. Requiere secador y producto, pero tiene mucha presencia.", ["low", "mid", "high", "skin", "taper", "tijera"]],
  ["slick", "Slick back", "medio", ["liso", "ondulado"], ["ovalada", "cuadrada", "alargada", "diamante"], "elegante", 2, "Todo peinado hacia atrás con acabado brillante. Elegante para el trabajo y para salir.", ["low", "mid", "high", "skin", "taper", "tijera", "under"]],
  ["side", "Raya al lado", "medio", ["liso", "ondulado"], ALL, "clasico", 2, "El clásico de siempre con la raya bien marcada. Atemporal y fácil de llevar.", ["low", "mid", "taper", "tijera"]],
  ["caesar", "Corte César", "corto", ["liso", "ondulado", "rizado"], ["ovalada", "cuadrada", "alargada", "diamante"], "clasico", 1, "Flequillo recto corto y todo el pelo casi a la misma longitud. Ideal si tienes entradas.", ["tijera", "taper", "low", "mid"]],
  ["buzz", "Rapado", "corto", ["liso", "ondulado", "rizado", "afro"], ["ovalada", "cuadrada", "diamante"], "urbano", 1, "A una sola longitud con máquina. Limpio, cómodo y sin mantenimiento.", ["skin", "low", "mid", "tijera"]],
  ["curly", "Rizos con degradado", "medio", ["rizado", "ondulado", "afro"], ["ovalada", "cuadrada", "redonda", "corazon", "diamante"], "moderno", 2, "Rizos naturales arriba con los laterales degradados. Se define con crema y se deja secar al aire.", ["low", "mid", "high", "skin", "taper", "burst", "drop"]],
  ["twist", "Twists / rizos definidos", "medio", ["afro", "rizado"], ALL, "urbano", 3, "Parte de arriba con twists o rizos definidos y laterales limpios. Estilo con mucha personalidad.", ["low", "mid", "high", "skin", "taper", "burst"]],
  ["hawk", "Faux hawk", "medio", ["liso", "ondulado", "rizado"], ["redonda", "cuadrada", "ovalada"], "atrevido", 2, "Cresta suave en el centro con los lados cortos. Alarga una cara redonda.", ["mid", "high", "skin", "taper", "burst"]],
  ["mullet", "Mullet moderno", "largo", ["liso", "ondulado", "rizado"], ["ovalada", "diamante", "corazon", "cuadrada"], "atrevido", 3, "Corto por delante y los lados, largo por detrás. La versión actual, muy texturizada.", ["taper", "tijera", "low", "mid", "burst"]],
  ["long", "Media melena", "largo", ["liso", "ondulado", "rizado"], ["ovalada", "cuadrada", "corazon", "diamante"], "moderno", 2, "Pelo largo con capas suaves. Solo hace falta mantener las puntas.", ["tijera", "taper"]],
  ["fringe", "Flequillo largo texturizado", "medio", ["liso", "ondulado"], ["ovalada", "cuadrada", "alargada", "diamante"], "moderno", 2, "Flequillo largo hacia un lado con textura. Suaviza facciones marcadas.", ["low", "mid", "taper", "tijera", "under", "skin"]],
  ["comb", "Comb over", "medio", ["liso", "ondulado"], ["ovalada", "cuadrada", "redonda"], "clasico", 2, "Raya marcada y pelo peinado de lado con los laterales muy cortos. Mucho contraste y muy cuidado.", ["low", "mid", "high", "skin", "taper", "drop"]],
  ["ivy", "Ivy League", "corto", ["liso", "ondulado"], ["ovalada", "cuadrada", "alargada", "corazon"], "clasico", 2, "Versión algo más larga del corte militar con raya al lado. Pulcro y de oficina.", ["taper", "tijera", "low"]],
  ["undertop", "Undercut desconectado", "medio", ["liso", "ondulado", "rizado"], ["ovalada", "cuadrada", "diamante"], "atrevido", 2, "Mucha diferencia entre la parte de arriba larga y los laterales rapados.", ["under"]],
  ["flat", "Cepillado (flat top)", "corto", ["liso", "rizado", "afro"], ["cuadrada", "ovalada"], "urbano", 2, "Parte de arriba recta como una mesa, con laterales degradados. Retro y con carácter.", ["low", "mid", "high", "skin", "taper"]],
  ["spiky", "Spiky texturizado", "corto", ["liso", "ondulado"], ["ovalada", "redonda", "corazon"], "moderno", 1, "Puntas levantadas con cera. Divertido, juvenil y rápido de peinar.", ["low", "mid", "high", "taper", "skin"]],
  ["flow", "Bro flow", "largo", ["liso", "ondulado"], ["ovalada", "cuadrada", "diamante"], "moderno", 2, "Pelo medio-largo peinado hacia atrás con movimiento natural.", ["taper", "tijera", "low"]],
  ["bun", "Coleta o moño", "largo", ["liso", "ondulado", "rizado", "afro"], ["ovalada", "cuadrada", "diamante", "alargada"], "urbano", 2, "Pelo largo recogido arriba con laterales cuidados. Despeja la cara.", ["under", "taper", "skin", "tijera"]]
];

var BEARDS = [
  ["Barba de 3 días", "Barba muy corta y uniforme con contornos limpios. Siempre queda bien y se mantiene fácil.", ALL, "moderno", 1],
  ["Barba completa recortada", "Barba llena a una longitud con mejillas y cuello perfilados. Da carácter y marca la mandíbula.", ["ovalada", "redonda", "corazon", "diamante"], "clasico", 2],
  ["Perilla (goatee)", "Vello solo en mentón y bigote. Alarga visualmente una cara redonda.", ["redonda", "ovalada", "cuadrada"], "atrevido", 2],
  ["Candado", "Bigote unido a la perilla formando un círculo. Elegante y muy definido.", ["redonda", "ovalada", "cuadrada", "diamante"], "elegante", 2],
  ["Barba larga cuidada", "Barba larga con volumen en el mentón y mantenimiento de aceite y peine.", ["ovalada", "cuadrada", "diamante"], "urbano", 3],
  ["Barba degradada", "La barba se funde con el degradado del pelo sin cortes bruscos. Muy limpia.", ["ovalada", "redonda", "cuadrada", "corazon"], "moderno", 2],
  ["Bigote clásico", "Bigote definido y recortado, sin barba. Estilo retro con mucha personalidad.", ["ovalada", "alargada", "diamante"], "clasico", 2],
  ["Afeitado clásico a navaja", "Afeitado completo con toalla caliente y navaja. El más limpio y relajante.", ALL, "clasico", 1]
];

var CUTS = [];
TOPS.forEach(function (t) {
  t[8].forEach(function (sid) {
    var s = SIDES[sid];
    CUTS.push({
      id: t[0] + "-" + sid, kind: "corte", name: t[1] + (sid === "tijera" ? " (a tijera)" : " + " + s.n), len: t[2], hair: t[3], style: t[5], effort: t[6],
      desc: t[7] + " Laterales: " + s.t + ".", fit: t[4], boost: s.boost, avoid: s.avoid, side: sid
    });
  });
});
BEARDS.forEach(function (b, i) { CUTS.push({ id: "barba-" + i, kind: "barba", name: b[0], len: "corto", hair: Object.keys(HAIRS), style: b[3], effort: b[4], desc: b[1], fit: b[2], boost: [], avoid: [], side: "" }); });

function score(c, face) {
  if (!face) return 0;
  return (c.fit.indexOf(face) >= 0 ? 2 : 0) + (c.boost.indexOf(face) >= 0 ? 1 : 0) - (c.avoid.indexOf(face) >= 0 ? 2 : 0);
}

/* Ilustración de relleno (hasta que haya fotos reales): cabeza y pelo según el largo y el degradado */
function art(c) {
  var hairH = c.len === "largo" ? 62 : c.len === "medio" ? 46 : 36;
  var fade = c.side && c.side !== "tijera";
  var hair = c.len === "largo"
    ? "M18 64 Q14 22 60 18 Q106 22 102 64 L102 92 Q96 80 96 60 Q90 40 60 38 Q30 40 24 60 Q24 80 18 92Z"
    : "M24 " + (hairH + 10) + " Q22 18 60 16 Q98 18 96 " + (hairH + 10) + " Q92 " + (hairH - 4) + " 60 " + (hairH - 10) + " Q28 " + (hairH - 4) + " 24 " + (hairH + 10) + "Z";
  var sides = fade ? "<rect x='22' y='46' width='12' height='34' rx='6' fill='url(#fd" + c.side + ")' opacity='.9'/><rect x='86' y='46' width='12' height='34' rx='6' fill='url(#fd" + c.side + ")' opacity='.9'/>" : "";
  var beard = c.kind === "barba" ? "<path d='M34 78 Q60 118 86 78 Q84 98 60 104 Q36 98 34 78Z' fill='#3a2c22'/>" : "";
  return "<svg viewBox='0 0 120 130' role='img' aria-label='Ilustración orientativa de " + esc(c.name) + "'><defs><linearGradient id='fd" + c.side + "' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#2a2420'/><stop offset='1' stop-color='#2a2420' stop-opacity='0'/></linearGradient></defs>" +
    "<ellipse cx='60' cy='70' rx='33' ry='42' fill='#C99772'/><ellipse cx='26' cy='72' rx='5' ry='9' fill='#B9855F'/><ellipse cx='94' cy='72' rx='5' ry='9' fill='#B9855F'/>" +
    (c.kind === "barba" ? "" : "<path d='" + hair + "' fill='#2A2420'/>") + sides + beard +
    "<circle cx='49' cy='68' r='2.4' fill='#3A2A20'/><circle cx='71' cy='68' r='2.4' fill='#3A2A20'/><path d='M53 88 q7 4 14 0' stroke='#8a5a3d' stroke-width='2' fill='none' stroke-linecap='round'/></svg>";
}

/* ---------------------------------------------------------------- clasificador de forma de cara */
// lm: puntos de MediaPipe Face Mesh ya en píxeles. Devuelve la forma aproximada y una advertencia si la cara no está de frente.
function faceShape(lm) {
  var d = function (a, b) { return Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y); };
  var cheek = d(234, 454), jaw = d(172, 397), fore = d(54, 284), len = d(10, 152);
  var r = len / cheek, fj = fore / cheek, jc = jaw / cheek;
  var left = d(1, 234), right = d(1, 454), yaw = Math.abs(left - right) / Math.max(left, right);
  var shape;
  if (r >= 1.5) shape = "alargada";
  else if (jc <= 0.76 && fj >= 0.88) shape = "corazon";
  else if (jc <= 0.78 && fj < 0.85) shape = "diamante";
  else if (jc >= 0.87 && r < 1.42) shape = "cuadrada";
  else if (r < 1.32 && jc >= 0.78) shape = "redonda";
  else shape = "ovalada";
  return { shape: shape, ratios: { r: +r.toFixed(2), fj: +fj.toFixed(2), jc: +jc.toFixed(2) }, frontal: yaw < 0.22 };
}
window.BB.faceShape = faceShape;

function faceIcon(f) {
  var p = { ovalada: "M30 6 Q50 6 50 36 Q50 66 30 72 Q10 66 10 36 Q10 6 30 6Z", redonda: "M30 12 Q54 12 54 38 Q54 64 30 66 Q6 64 6 38 Q6 12 30 12Z", cuadrada: "M12 10 H48 Q52 10 52 16 V50 Q52 66 40 70 H20 Q8 66 8 50 V16 Q8 10 12 10Z", alargada: "M30 2 Q48 2 48 30 Q48 70 30 78 Q12 70 12 30 Q12 2 30 2Z", corazon: "M8 14 Q30 4 52 14 Q52 44 30 74 Q8 44 8 14Z", diamante: "M30 4 Q42 20 52 38 Q42 58 30 74 Q18 58 8 38 Q18 20 30 4Z" }[f];
  return "<svg viewBox='0 0 60 80' aria-hidden='true'><path d='" + p + "' fill='none' stroke='#C9A24B' stroke-width='3' stroke-linejoin='round'/></svg>";
}

/* ---------------------------------------------------------------- UI */
var root = $("#cortes-app"), STATE = { tab: "galeria", face: "", hair: "", len: "", style: "", kind: "", shown: 24 };
if (!root) return;
var TABS = [["galeria", "Galería de cortes"], ["test", "Test: ¿qué me va?"], ["cara", "Analizar mi cara"], ["ia", "Probador con IA"]];

function render() {
  root.innerHTML = "<div class='cl-tabs' role='tablist' aria-label='Herramientas'>" + TABS.map(function (t) { return "<button type='button' role='tab' class='bx-chip' data-tab='" + t[0] + "' aria-selected='" + (STATE.tab === t[0]) + "' aria-pressed='" + (STATE.tab === t[0]) + "'>" + t[1] + "</button>"; }).join("") + "</div><div id='cl-panel' class='cl-panel' role='tabpanel'></div>";
  root.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { STATE.tab = b.dataset.tab; render(); }); });
  var p = $("#cl-panel", root);
  if (STATE.tab === "galeria") gallery(p); else if (STATE.tab === "test") quiz(p); else if (STATE.tab === "cara") faceTool(p); else tryonTab(p);
}

function chips(name, map, label, withAll) {
  return "<div class='grp'><span class='lbl'>" + label + "</span>" +
    "<button type='button' class='bx-chip' data-f='" + name + "' data-v='' aria-pressed='" + (STATE[name] === "") + "'>Todos</button>" +
    Object.keys(map).map(function (k) { return "<button type='button' class='bx-chip' data-f='" + name + "' data-v='" + k + "' aria-pressed='" + (STATE[name] === k) + "'>" + map[k] + "</button>"; }).join("") + "</div>";
}

function hasPhoto(c) { return BB.photos === true || (BB.photoIds || []).indexOf(c.id) > -1; }

function card(c, face) {
  var s = score(c, face), rec = face && s >= 2;
  return "<article class='cl-card'><div class='cl-pic'>" + (hasPhoto(c) ? "<img loading='lazy' decoding='async' src='img/cortes/" + c.id + ".webp' alt='" + esc(c.name) + "'>" : art(c)) + (hasPhoto(c) ? "" : "<i>Foto próximamente</i>") + "</div>" +
    "<div class='cl-body'><h4>" + esc(c.name) + "</h4><div class='cl-tags'>" + (rec ? "<span style='border-color:var(--g)'>★ Para tu cara</span>" : "") + "<span>" + (LENS[c.len] || "") + "</span><span>" + STYLES[c.style] + "</span><span>" + ["", "Fácil", "Medio", "Cuidado"][c.effort] + "</span></div>" +
    "<p>" + esc(c.desc) + "</p><button type='button' class='bx-btn' style='min-height:42px;font-size:.85rem' data-pick='" + esc(c.name) + "'>Quiero este</button></div></article>";
}

function gallery(p) {
  var list = CUTS.filter(function (c) {
    return (!STATE.kind || c.kind === STATE.kind) && (!STATE.hair || c.hair.indexOf(STATE.hair) >= 0) && (!STATE.len || c.len === STATE.len) && (!STATE.style || c.style === STATE.style);
  });
  if (STATE.face) list = list.slice().sort(function (a, b) { return score(b, STATE.face) - score(a, STATE.face); });
  // Los cortes con foto real van primero (Array.sort es estable)
  list = list.slice().sort(function (a, b) { return (hasPhoto(b) ? 1 : 0) - (hasPhoto(a) ? 1 : 0); });
  p.innerHTML = "<div class='cl-filters'>" + chips("kind", { corte: "Cortes", barba: "Barbas" }, "Tipo") + chips("face", FACES, "Tu cara") + chips("hair", HAIRS, "Tu pelo") + chips("len", LENS, "Largo") + chips("style", STYLES, "Estilo") + "</div>" +
    "<p class='cl-count' aria-live='polite'>" + list.length + " de " + CUTS.length + " estilos" + (STATE.face ? " · ordenados para cara " + FACES[STATE.face].toLowerCase() : "") + "</p>" +
    "<div class='cl-grid'>" + list.slice(0, STATE.shown).map(function (c) { return card(c, STATE.face); }).join("") + "</div>" +
    (list.length > STATE.shown ? "<p style='text-align:center;margin-top:1.4rem'><button type='button' class='bx-ghost' id='cl-more'>Ver más (" + (list.length - STATE.shown) + ")</button></p>" : "") +
    (list.length ? "" : "<p class='cl-count'>Ningún estilo con esos filtros. Quita alguno.</p>") +
    "<p class='cl-count'>Las imágenes son ilustraciones orientativas; en la barbería te enseñamos cómo te quedaría.</p>";
  p.querySelectorAll("[data-f]").forEach(function (b) { b.addEventListener("click", function () { STATE[b.dataset.f] = b.dataset.v; STATE.shown = 24; render(); }); });
  var m = $("#cl-more", p); if (m) m.addEventListener("click", function () { STATE.shown += 24; render(); });
  p.querySelectorAll("[data-pick]").forEach(function (b) { b.addEventListener("click", function () { BB.chooseCut(b.dataset.pick); }); });
}

/* ---- test ---- */
var QUIZ = { step: 0, ans: {} };
var QS = [
  ["face", "¿Qué forma tiene tu cara?", FACES, "No lo sé: analizo mi cara con una foto"],
  ["hair", "¿Cómo es tu pelo?", HAIRS],
  ["len", "¿Qué largo prefieres?", LENS],
  ["style", "¿Qué estilo te gusta?", STYLES],
  ["effort", "¿Cuánto tiempo quieres dedicarle cada día?", { 1: "Casi nada (menos de 2 min)", 2: "Un poco (5 min)", 3: "Me gusta peinarme (10 min o más)" }]
];
function quiz(p) {
  if (QUIZ.step >= QS.length) return quizResult(p);
  var q = QS[QUIZ.step];
  p.innerHTML = "<div class='cl-q'><div class='cl-bar'><i style='width:" + (QUIZ.step / QS.length * 100) + "%'></i></div><p class='bx-small'>Pregunta " + (QUIZ.step + 1) + " de " + QS.length + "</p><h4>" + q[1] + "</h4><div class='opts'>" +
    Object.keys(q[2]).map(function (k) { return "<button type='button' class='bx-chip' style='text-align:left;border-radius:.9rem;padding:.7rem 1rem' data-a='" + k + "'>" + q[2][k] + "</button>"; }).join("") +
    (q[3] ? "<button type='button' class='bx-ghost' data-go-face>" + q[3] + "</button>" : "") + "</div>" + (QUIZ.step ? "<p style='margin-top:1rem'><button type='button' class='cx-link' id='q-back'>← Anterior</button></p>" : "") + "</div>";
  p.querySelectorAll("[data-a]").forEach(function (b) { b.addEventListener("click", function () { QUIZ.ans[q[0]] = b.dataset.a; QUIZ.step++; render(); }); });
  var g = $("[data-go-face]", p); if (g) g.addEventListener("click", function () { STATE.tab = "cara"; render(); });
  var bk = $("#q-back", p); if (bk) bk.addEventListener("click", function () { QUIZ.step--; render(); });
}
function recommend(a) {
  return CUTS.filter(function (c) { return c.kind === "corte" && (!a.hair || c.hair.indexOf(a.hair) >= 0); }).map(function (c) {
    var s = score(c, a.face) * 2 + (a.style && c.style === a.style ? 3 : 0) + (a.len && c.len === a.len ? 3 : 0) - (a.effort ? Math.abs(c.effort - Number(a.effort)) : 0);
    return { c: c, s: s };
  }).sort(function (x, y) { return y.s - x.s; }).slice(0, 3).map(function (x) { return x.c; });
}
function quizResult(p) {
  var picks = recommend(QUIZ.ans);
  p.innerHTML = "<div class='cl-res'><div class='cl-shape'>" + (QUIZ.ans.face ? faceIcon(QUIZ.ans.face) : "") + "<div><b>Tus 3 cortes ideales</b><span class='bx-small'>" + (QUIZ.ans.face ? "Cara " + FACES[QUIZ.ans.face].toLowerCase() + " · " : "") + "pelo " + (HAIRS[QUIZ.ans.hair] || "").toLowerCase() + " · " + (STYLES[QUIZ.ans.style] || "").toLowerCase() + "</span></div></div><div class='cl-grid'>" + picks.map(function (c) { return card(c, QUIZ.ans.face); }).join("") + "</div><p style='text-align:center;margin-top:1.4rem'><button type='button' class='bx-ghost' id='q-again'>Repetir el test</button></p></div>";
  p.querySelectorAll("[data-pick]").forEach(function (b) { b.addEventListener("click", function () { BB.chooseCut(b.dataset.pick); }); });
  $("#q-again", p).addEventListener("click", function () { QUIZ = { step: 0, ans: {} }; render(); });
}

/* ---- análisis de cara en el propio móvil (MediaPipe desde jsDelivr; la foto no se sube a ningún servidor) ---- */
var MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14", LMK = null;
function loadLandmarker() {
  if (LMK) return LMK;
  LMK = import(MP + "/vision_bundle.mjs").then(function (m) {
    return m.FilesetResolver.forVisionTasks(MP + "/wasm").then(function (fs) {
      return m.FaceLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" }, runningMode: "IMAGE", numFaces: 1 });
    });
  });
  LMK.catch(function () { LMK = null; });
  return LMK;
}
function faceTool(p) {
  p.innerHTML = "<div class='cl-res'><div class='cl-drop'><p style='font-size:1.1rem;font-weight:800'>Sube una foto tuya de frente</p><p class='bx-small' style='max-width:420px'>Mira a la cámara con la cara despejada y sin gafas. El análisis se hace <b>en tu móvil</b>: la foto no se envía ni se guarda en ningún sitio.</p>" +
    "<input id='cl-file' type='file' accept='image/*' capture='user' hidden><button type='button' class='bx-btn' id='cl-pick'>Elegir o hacer una foto</button><p id='cl-m' class='bx-msg' role='status' aria-live='polite'></p></div>" +
    "<h3 style='margin:1.6rem 0 .2rem;text-align:center;font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;color:var(--g)'>O elige tu forma de cara</h3><div class='cl-faces'>" + Object.keys(FACES).map(function (k) { return "<button type='button' data-face='" + k + "'>" + faceIcon(k) + FACES[k] + "</button>"; }).join("") + "</div><div id='cl-out'></div></div>";
  var file = $("#cl-file", p), m = $("#cl-m", p);
  $("#cl-pick", p).addEventListener("click", function () { file.click(); });
  p.querySelectorAll("[data-face]").forEach(function (b) { b.addEventListener("click", function () { showFace(b.dataset.face, true); }); });
  file.addEventListener("change", function () {
    var f = file.files && file.files[0]; if (!f) return;
    BB.msg(m, "Preparando el análisis (la primera vez tarda unos segundos)…");
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function () {
      loadLandmarker().then(function (lm) {
        var res = lm.detect(img);
        URL.revokeObjectURL(url);
        if (!res.faceLandmarks || !res.faceLandmarks.length) { BB.msg(m, "No hemos encontrado ninguna cara. Prueba con otra foto, de frente y con buena luz.", "err"); return; }
        var W = img.naturalWidth, H = img.naturalHeight;
        var pts = res.faceLandmarks[0].map(function (q) { return { x: q.x * W, y: q.y * H }; });
        var r = faceShape(pts);
        BB.msg(m, r.frontal ? "" : "La cara está algo girada: el resultado puede no ser exacto. Si no te cuadra, elige tu forma abajo.", r.frontal ? "" : "err");
        showFace(r.shape, false);
      }).catch(function () { URL.revokeObjectURL(url); BB.msg(m, "No se pudo cargar el analizador (¿sin conexión?). Elige tu forma de cara abajo.", "err"); });
    };
    img.onerror = function () { URL.revokeObjectURL(url); BB.msg(m, "No se pudo leer la foto.", "err"); };
    img.src = url;
  });
}
function showFace(face, manual) {
  var out = $("#cl-out"), picks = CUTS.filter(function (c) { return c.kind === "corte"; }).sort(function (a, b) { return score(b, face) - score(a, face); }).slice(0, 6);
  out.innerHTML = "<div class='cl-shape' style='margin-top:1.6rem'>" + faceIcon(face) + "<div><b>Cara " + FACES[face].toLowerCase() + "</b><span class='bx-small'>" + (manual ? "" : "Resultado aproximado. Si no te cuadra, elige otra arriba. ") + "Estos son los cortes que mejor te sientan:</span></div></div><div class='cl-grid'>" + picks.map(function (c) { return card(c, face); }).join("") + "</div><p style='text-align:center;margin-top:1.2rem'><button type='button' class='bx-ghost' id='cl-see'>Ver toda la galería para mi cara</button></p>";
  out.querySelectorAll("[data-pick]").forEach(function (b) { b.addEventListener("click", function () { BB.chooseCut(b.dataset.pick); }); });
  $("#cl-see", out).addEventListener("click", function () { STATE.face = face; STATE.tab = "galeria"; STATE.shown = 24; render(); });
  out.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ---- probador con IA (se activa en el servidor; hasta entonces muestra la versión "próximamente") ---- */
function tryonTab(p) {
  var cfg = BB.getConfig() || {};
  if (!cfg.tryon) {
    p.innerHTML = "<div class='cl-soon'><p style='font-size:1.2rem;font-weight:900;color:var(--gl)'>Pruébate el corte antes de cortarte</p><p class='bx-small' style='margin:.6rem 0 1rem;line-height:1.6'>Sube tu foto, elige un corte y una IA te enseña cómo te quedaría. Estamos terminando de afinarlo: muy pronto disponible para los socios del club.</p><button type='button' class='bx-ghost' id='ia-test'>Mientras tanto, haz el test</button></div>";
    $("#ia-test", p).addEventListener("click", function () { STATE.tab = "test"; render(); });
    return;
  }
  var user = BB.getUser();
  if (!user) { p.innerHTML = "<div class='cl-soon'><p style='font-size:1.1rem;font-weight:800'>El probador es para socios del club</p><p class='bx-small' style='margin:.6rem 0 1rem'>Crea tu cuenta gratis (con puntos de bienvenida) para probarlo.</p><button type='button' class='bx-btn' id='ia-login'>Entrar o crear cuenta</button></div>"; $("#ia-login", p).addEventListener("click", function () { BB.openAccount("register"); }); return; }
  var opts = CUTS.filter(function (c) { return c.kind === "corte"; }).map(function (c) { return "<option>" + esc(c.name) + "</option>"; }).join("");
  p.innerHTML = "<div class='cl-res'><div class='cl-drop'><label class='bx-lab' for='ia-cut' style='margin:0'>Corte</label><select id='ia-cut' class='bx-in' style='max-width:360px'>" + opts + "</select><input id='ia-file' type='file' accept='image/*' capture='user' hidden><button type='button' class='bx-ghost' id='ia-pick'>Elegir foto</button><img id='ia-prev' class='cl-prev' alt='' hidden>" +
    "<label class='bk-terms' style='max-width:420px;text-align:left'><input id='ia-ok' type='checkbox'><span>Acepto que mi foto se envíe a un proveedor de IA solo para generar esta imagen. No se guarda en nuestro servidor.</span></label><p id='ia-m' class='bx-msg' role='status' aria-live='polite'></p><button type='button' class='bx-btn' id='ia-go' disabled>Probar este corte</button></div><div id='ia-out' style='text-align:center;margin-top:1.2rem'></div></div>";
  var data = "", m = $("#ia-m", p), go = $("#ia-go", p);
  $("#ia-pick", p).addEventListener("click", function () { $("#ia-file", p).click(); });
  $("#ia-file", p).addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var url = URL.createObjectURL(f), im = new Image();
    im.onload = function () {
      var s = Math.min(1, 768 / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement("canvas");
      c.width = Math.round(im.naturalWidth * s); c.height = Math.round(im.naturalHeight * s);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
      data = c.toDataURL("image/jpeg", 0.85); URL.revokeObjectURL(url);
      var pv = $("#ia-prev", p); pv.src = data; pv.hidden = false; go.disabled = false;
    };
    im.src = url;
  });
  go.addEventListener("click", function () {
    if (!data) return;
    if (!$("#ia-ok", p).checked) { BB.msg(m, "Marca la casilla para continuar.", "err"); return; }
    go.disabled = true; BB.msg(m, "Generando… puede tardar unos 20 segundos.");
    BB.api("POST", "/api/tryon", { image: data, cut: $("#ia-cut", p).value, consent: true }).then(function (r) {
      BB.msg(m, "", ""); $("#ia-out", p).innerHTML = "<img class='cl-prev' style='max-width:320px' src='" + esc(r.url) + "' alt='Simulación del corte con IA'><p class='bx-small' style='margin-top:.6rem'>Imagen orientativa generada con IA; el resultado real depende de tu pelo.</p>"; go.disabled = false;
    }).catch(function (er) { BB.msg(m, er.message, "err"); go.disabled = false; });
  });
}

BB.photos = false; // pasar a true cuando estén TODAS las fotos en /img/cortes/<id>.webp
BB.photoIds = ["quiff-skin", "side-mid", "buzz-skin", "curly-taper"]; // fotos ya subidas (mientras tanto el resto usa el dibujo)
render();
})();
