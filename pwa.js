/* pwa.js · Instalación como app y avisos push (cliente y barbero). Sin dependencias. */
(function () {
  "use strict";
  var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  var ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var deferred = null;

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("/sw.js").catch(function () {}); });
  }

  /* ---- Instalar ---- */
  function refresh() {
    [].forEach.call(document.querySelectorAll("[data-install]"), function (b) { b.hidden = standalone; });
  }
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; refresh(); });
  window.addEventListener("appinstalled", function () { deferred = null; standalone = true; refresh(); });
  document.addEventListener("DOMContentLoaded", refresh);

  function androidHelp() {
    var d = document.createElement("dialog");
    d.setAttribute("aria-label", "Cómo instalar la app");
    d.style.cssText = "max-width:24rem;width:calc(100% - 2rem);margin:auto;box-sizing:border-box;border:1px solid #3a3a3d;border-radius:1.2rem;background:#171718;color:#F5F1E8;padding:1.4rem;font:inherit";
    d.innerHTML = "<h2 style='margin:0 0 .6rem;font-size:1.15rem;letter-spacing:0;text-transform:none;color:#E6C57A'>Instala la app en tu móvil</h2>" +
      "<ol style='padding-left:1.2rem;line-height:1.8;color:#d6d0c4'><li>Abre esta página en <b>Chrome</b> (no dentro de otra app).</li><li>Pulsa los <b>tres puntos ⋮</b> de arriba a la derecha.</li><li>Elige <b>Instalar aplicación</b> o <b>Añadir a pantalla de inicio</b>.</li><li>Confirma con <b>Instalar</b> y abre el icono nuevo.</li></ol>" +
      "<button type='button' style='margin-top:.8rem;width:100%;min-height:46px;border:0;border-radius:999px;background:#C9A24B;color:#111;font-weight:800;font:inherit;font-weight:800'>Entendido</button>";
    d.querySelector("button").addEventListener("click", function () { d.close(); d.remove(); });
    d.addEventListener("close", function () { d.remove(); });
    document.body.appendChild(d); d.showModal();
  }
  function iosHelp() {
    var d = document.createElement("dialog");
    d.setAttribute("aria-label", "Cómo instalar la app");
    d.style.cssText = "max-width:24rem;width:calc(100% - 2rem);margin:auto;box-sizing:border-box;border:1px solid #3a3a3d;border-radius:1.2rem;background:#171718;color:#F5F1E8;padding:1.4rem;font:inherit";
    d.innerHTML = "<h2 style='margin:0 0 .6rem;font-size:1.15rem;letter-spacing:0;text-transform:none;color:#E6C57A'>Instala la app en tu iPhone</h2>" +
      "<ol style='padding-left:1.2rem;line-height:1.8;color:#d6d0c4'><li>Abre esta página en <b>Safari</b>.</li><li>Pulsa el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li><li>Elige <b>Añadir a pantalla de inicio</b>.</li></ol>" +
      "<button type='button' style='margin-top:.8rem;width:100%;min-height:46px;border:0;border-radius:999px;background:#C9A24B;color:#111;font-weight:800;font:inherit;font-weight:800'>Entendido</button>";
    d.querySelector("button").addEventListener("click", function () { d.close(); d.remove(); });
    d.addEventListener("close", function () { d.remove(); });
    document.body.appendChild(d); d.showModal();
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-install]");
    if (!b) return;
    e.preventDefault();
    if (deferred) { deferred.prompt(); deferred.userChoice.then(function () { deferred = null; refresh(); }); }
    else if (ios) { iosHelp(); }
    else { androidHelp(); }
  });

  /* ---- Avisos push ---- */
  function supported() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
  function toBytes(s) {
    var p = "=".repeat((4 - (s.length % 4)) % 4), b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")), o = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) o[i] = b.charCodeAt(i);
    return o;
  }
  function fail(msg) { var e = new Error(msg); e.friendly = true; return e; }

  async function subscribe(opts) {
    opts = opts || {};
    if (!supported()) throw fail(ios && !standalone ? "En iPhone, primero instala la app: Compartir → Añadir a pantalla de inicio. Después podrás activar los avisos." : "Este navegador no admite avisos en el móvil.");
    var perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") throw fail("Has bloqueado los avisos. Puedes permitirlos en los ajustes del navegador.");
    var reg = await navigator.serviceWorker.ready;
    var k = await fetch("/api/push/key").then(function (r) { return r.json(); }).catch(function () { return {}; });
    if (!k.key) throw fail("Los avisos no están disponibles ahora mismo.");
    var sub = await reg.pushManager.getSubscription();
    if (!sub) {
      try { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(k.key) }); }
      catch (e) { throw fail("No se pudo activar los avisos en este dispositivo."); }
    }
    var headers = { "content-type": "application/json" };
    if (opts.admin) headers["x-admin-token"] = opts.token || "";
    var r = await fetch(opts.admin ? "/api/admin/push/subscribe" : "/api/push/subscribe", { method: "POST", headers: headers, body: JSON.stringify({ sub: sub.toJSON(), code: opts.code || "" }) });
    if (!r.ok) { var j = await r.json().catch(function () { return {}; }); throw fail(j.error || "No se pudo guardar el aviso."); }
    return true;
  }
  async function current() {
    if (!supported()) return null;
    try { var reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); } catch (e) { return null; }
  }
  async function unsubscribe(opts) {
    opts = opts || {};
    var sub = await current(); if (!sub) return;
    var headers = { "content-type": "application/json" };
    if (opts.admin) headers["x-admin-token"] = opts.token || "";
    await fetch(opts.admin ? "/api/admin/push/unsubscribe" : "/api/push/unsubscribe", { method: "POST", headers: headers, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(function () {});
    await sub.unsubscribe().catch(function () {});
  }

  window.BBPWA = { refresh: refresh, supported: supported, subscribe: subscribe, unsubscribe: unsubscribe, current: current, ios: ios, standalone: function () { return standalone; } };
})();
