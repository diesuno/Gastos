const CACHE_NAME = 'finanzas-v13.0.0'; // FIX IMPORTANTE: el Service Worker ya no intercepta Firestore/Firebase/cotizaciones externas — probable causa del "se queda pensando"
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
  './cierreMensual.js',
  './periodo.js'
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

// Estrategia "Network First": Siempre intenta traer lo más nuevo de internet primero.
// IMPORTANTE: solo aplicamos esto a pedidos de NUESTRO propio sitio (los
// archivos de la app). Cualquier otro pedido — la conexión en vivo con
// Firestore, Firebase Auth, o las cotizaciones externas (Yahoo, BYMA,
// dolarapi) — lo dejamos pasar SIN TOCAR, tal cual lo haría el navegador sin
// Service Worker. Interceptar esas conexiones (sobre todo la de Firestore,
// que es de larga duración) puede trabarlas sin generar ningún error visible
// — esto es lo que probablemente causaba el "se queda pensando" al cargar.
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
