// Service worker: guscio dell'app in cache, dati sempre dalla rete.
const V = 'iq8do-v6';
const SHELL = ['./', 'app.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/logo-96.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  // Gestiamo solo il guscio dell'app: il resto del sito (dati, pagine classiche) passa dalla rete senza toccarlo.
  const own = u.pathname === '/' || /^\/(app\.js|app\.css|manifest\.webmanifest)$/.test(u.pathname) || /^\/(flags|icons)\//.test(u.pathname);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !own) return;
  if (/\/flags\//.test(u.pathname)) { e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((ca) => ca.put(e.request, c)); return r; }))); return; }
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(V).then((ca) => ca.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => { const c = cs.find((w) => 'focus' in w); if (c) return c.focus(); return self.clients.openWindow(url); }));
});

// Notifiche push dal server: anche con l'app chiusa
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'IQ8DO DX Cluster', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: d.tag || 'iq8do', renotify: false, data: { url: d.url || './' },
  }));
});
