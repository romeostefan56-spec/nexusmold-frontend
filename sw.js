/* NexusMold Cloud - Service Worker (v3) */
const VERSION = 'nexusmold-v5';
const SHELL_CACHE = VERSION + '-shell';
const CDN_CACHE = VERSION + '-cdn';
const SHELL_FILES = [
  './',
  './index.html',
  './admin.html',
  './manifest.webmanifest',
  './i18n.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* Installazione: precarica la shell e prende il controllo subito */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

/* Attivazione: preload di navigazione + pulizia cache obsolete */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      if (self.registration.navigationPreload) {
        try { await self.registration.navigationPreload.enable(); } catch (e) { /* non supportato */ }
      }
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

/* Comando manuale di attivazione (eventuali futur update) */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca interceptar la API: siempre red al servidor de Render
  if (url.hostname.includes('decomol-api.onrender.com') || url.pathname.includes('/api/')) return;

  // CDN (Tailwind, Google Fonts): stale-while-revalidate
  if (url.hostname.includes('cdn.tailwindcss.com') || url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.open(CDN_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  // Navegación y estáticos propios: network-first con precarga y respaldo offline
  if (event.request.mode === 'navigate' || (event.request.method === 'GET' && url.origin === self.location.origin)) {
    event.respondWith(
      (async () => {
        try {
          // Usa la respuesta precargada si existe (más rápido tras el arranque del SW)
          if (event.preloadResponse) {
            const preload = await event.preloadResponse;
            if (preload) return preload;
          }
          const response = await fetch(event.request);
          if (response.ok) {
            const clone = response.clone();
            const cache = await caches.open(SHELL_CACHE);
            cache.put(event.request, clone);
          }
          return response;
        } catch (err) {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const shell = await caches.match('./index.html');
          if (shell) return shell;
          return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
        }
      })()
    );
  }
});
