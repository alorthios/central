/*
 * Service worker d'Allô Central (#57) : l'interface démarre vite et s'installe comme une
 * application. La partie, elle, passe toujours par le serveur : le WebSocket et le
 * healthcheck ne sont jamais mis en cache.
 *
 * - Fichiers de build (/assets/*, noms à empreinte) : servis du cache, téléchargés une fois.
 * - Page, manifeste, icônes : réseau d'abord, cache en secours (hors connexion).
 */
const CACHE = 'allo-central-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

const OFFLINE = `<!doctype html><html lang="fr"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Allô Central</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#17110d;color:#f3eada;font-family:system-ui,sans-serif;text-align:center">
<main><h1>Allô Central</h1><p>Le central ne répond pas : vérifiez la connexion, puis rechargez.</p></main>`;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/ws' || url.pathname === '/healthz') return;

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          // Une page de jeu (?room=…, ?dev…) se met en cache sous « / » : l'interface est la même.
          const key = request.mode === 'navigate' ? '/' : request;
          void caches.open(CACHE).then((cache) => cache.put(key, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request.mode === 'navigate' ? '/' : request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          return new Response(OFFLINE, { headers: { 'content-type': 'text/html; charset=utf-8' } });
        }
        return Response.error();
      }),
  );
});
