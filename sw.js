/* sw.js · Service worker de Infinity Barber
   - Guarda la "carcasa" de la web para abrir al instante y funcionar sin conexión (página offline).
   - Nunca guarda /api/* (reservas, cuentas y panel siempre van a la red).
   - Recibe avisos push (cita nueva para el barbero, recordatorios para el cliente). */
const VERSION = "bb-v4";
const SHELL = ["/offline.html", "/app.css", "/app.js", "/cortes.js", "/pwa.js", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Páginas: red primero (siempre lo último); si no hay conexión, la última copia o la página offline
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok && !url.pathname.startsWith("/admin")) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(async () => (await caches.match(req, { ignoreSearch: true })) || (await caches.match("/")) || (await caches.match("/offline.html")))
    );
    return;
  }
  // Código de la app (js/css): red primero para que una actualización se vea al instante; copia si no hay conexión
  if (/^\/(admin|app|pwa|cortes)\.js$|^\/app\.css$/.test(url.pathname)) {
    e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; }).catch(() => caches.match(req)));
    return;
  }
  // Estáticos (imágenes, iconos…): sirve la copia y la actualiza en segundo plano
  e.respondWith(
    caches.open(VERSION).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })
  );
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "Infinity Barber", body: e.data ? e.data.text() : "" }; }
  const title = String(d.title || "Infinity Barber").slice(0, 80);
  e.waitUntil(self.registration.showNotification(title, {
    body: String(d.body || "").slice(0, 200),
    icon: d.admin ? "/icons/admin-192.png" : "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || "/" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "/", location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.split("#")[0] === target.split("#")[0] && "focus" in c) return c.focus(); }
    return self.clients.openWindow(target);
  }));
});
