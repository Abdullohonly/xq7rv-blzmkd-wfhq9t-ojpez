/* Lahzam service worker: avval internetdan oladi (har doim yangi versiya), internet yo'q bo'lsa keshdan */
const CACHE = 'lahzam-1.0.1';
const SHELL = ['/', '/index.html', '/app.js?v=10', '/flappy.js?v=10', '/tetris.js?v=10', '/styles.css?v=10', '/icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  const nav = e.request.mode === 'navigate', key = nav ? '/index.html' : e.request;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
    return r;
  }).catch(() => caches.match(key).then(hit => hit || Response.error())));
});
