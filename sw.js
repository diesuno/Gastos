const CACHE_NAME = 'finanzas-v12.0.0';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './main.js',
  './estado.js',
  './auth.js',
  './render.js',
  './movimientos.js',
  './flujoMensual.js',
  './cierreMensual.js',
  './deudas.js',
  './billetera.js',
  './grafico.js',
  './modales.js',
  './utilidades.js',
  './periodo.js',
  './icono-192.png',
  './icono-512.png',
  ];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
    );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
                       )
    );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

                      // Solo cachear pedidos del propio origen.
                      // Firebase, Firestore y cualquier CDN externo pasan directo
                      // para no bloquear datos en tiempo real.
                      if (url.origin !== self.location.origin) {
                        event.respondWith(fetch(event.request));
                        return;
                      }

                      event.respondWith(
                        caches.match(event.request).then(cached => cached || fetch(event.request))
                        );
});
