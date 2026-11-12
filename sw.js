// App-shell cache only. Network first, so a deploy is picked up on the next load;
// the cache is the fallback when the gym has no signal. Video, fonts and API
// calls are cross-origin and are never cached here.
const CACHE = 'itz-shell-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icon.svg', 'icons/icon-192.png',
  'js/main.js', 'js/brand.js', 'js/config.js', 'js/catalog.js', 'js/rules.js', 'js/store.js', 'js/sync.js',
  'js/analytics.js', 'js/audio.js', 'js/dom.js', 'js/court.js',
  'js/backend/index.js', 'js/backend/errors.js', 'js/backend/local.js', 'js/backend/supabase.js',
  'js/views/auth.js', 'js/views/library.js', 'js/views/train.js', 'js/views/report.js', 'js/views/logbook.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
        return response.clone();
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((cached) => cached || caches.match('index.html'))));
});
