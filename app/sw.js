/* Lahzam service worker: avval internetdan oladi (har doim yangi versiya), internet yo'q bo'lsa keshdan */
const CACHE = 'lahzam-1.16.0';
const SHELL = ['/', '/index.html', '/app.js?v=80', '/boot.js?v=80', '/flappy.js?v=80', '/tetris.js?v=80', '/game2048.js?v=80', '/mines.js?v=80', '/xo.js?v=80', '/stickers.js?v=80', '/docs.js?v=80', '/icon-192.png', '/styles.css?v=80', '/icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/manifest.webmanifest' || url.pathname === '/apple-touch-icon.png') return;
  const nav = e.request.mode === 'navigate', key = nav ? '/index.html' : e.request;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
    return r;
  }).catch(() => caches.match(key).then(hit => hit || Response.error())));
});
// Push: ilova yopiq bo'lsa ham xabar telefonga keladi
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Lahzam', {
    body: d.body || '', icon: '/icon-192.png', badge: '/badge.png', tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || '/' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const path = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    const w = ws.find(x => 'focus' in x);
    if (w) { w.postMessage({ go: path }); return w.focus(); }
    return self.clients.openWindow(path);
  }));
});
