const CACHE_NAME = 'finanzas-v8.3.1'; // Gráfico: números con coma decimal (es-AR) y máximo 2 decimales
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './modales.js',
  './main.js',
  './estado.js',
  './firebase-config.js',
  './utilidades.js',
  './auth.js',
  './movimientos.js',
  './billetera.js',
  './deudas.js',
  './render.js',
  './grafico.js',
  './flujoMensual.js',
  './cierreMensual.js'
];

// Instala la nueva versión
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// ESTA ES LA MAGIA: Borra la memoria vieja apenas detecta esta versión
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Borrando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Estrategia "Network First": Siempre intenta traer lo más nuevo de internet primero
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
