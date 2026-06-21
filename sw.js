const CACHE_NAME = 'finanzas-v1';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// Instala el Service Worker y guarda en caché los archivos básicos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Intercepta las peticiones de red para usar la caché si no hay internet
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});