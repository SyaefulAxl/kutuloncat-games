// KutuLoncat Service Worker — minimal cache-first for static assets
const CACHE_NAME = 'kutuloncat-v1';
const PRECACHE = ['/', '/favicon.ico', '/favicon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Only cache same-origin GET requests for static assets
  if (
    e.request.method !== 'GET' ||
    !url.pathname.match(/\.(js|css|png|ico|svg|woff2?|ttf)$/)
  ) {
    return; // network-only for API calls and HTML
  }
  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ||
        fetch(e.request).then((resp) => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          return resp;
        }),
    ),
  );
});
