const PWA_VERSION = '__QIDIAN_PWA_VERSION__';
const CACHE_PREFIX = 'qidian-pwa-shell-';
const CACHE_NAME = `${CACHE_PREFIX}${PWA_VERSION}`;
const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icons/qidian-apple-touch.png',
  '/icons/qidian-180.png',
  '/icons/qidian-192.png',
  '/icons/qidian-512.png',
  '/icons/qidian.svg',
  '/icons/qidian-maskable.svg'
];

function isCacheableRequest(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname === '/' || url.pathname === '/index.html') return request.mode === 'navigate';
  if (url.search) return false;
  if (url.pathname === '/manifest.webmanifest') return true;
  if (url.pathname.startsWith('/icons/')) return /\.(?:png|svg)$/.test(url.pathname);
  return url.pathname.startsWith('/assets/') && /\.(?:js|css|svg|png|jpe?g|webp|woff2)$/.test(url.pathname);
}

function isCacheableResponse(request, response) {
  if (!response.ok || response.type !== 'basic') return false;
  const path = new URL(request.url).pathname;
  const mime = response.headers.get('content-type')?.toLowerCase() || '';
  if (path === '/' || path === '/index.html') return mime.includes('text/html');
  if (path === '/manifest.webmanifest') return mime.includes('manifest+json') || mime.includes('application/json');
  if (/\.js$/.test(path)) return mime.includes('javascript');
  if (/\.css$/.test(path)) return mime.includes('text/css');
  if (/\.svg$/.test(path)) return mime.includes('image/svg+xml');
  if (/\.png$/.test(path)) return mime.includes('image/png');
  if (/\.jpe?g$/.test(path)) return mime.includes('image/jpeg');
  if (/\.webp$/.test(path)) return mime.includes('image/webp');
  if (/\.woff2$/.test(path)) return mime.includes('font/woff2');
  return false;
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_URLS)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (!isCacheableRequest(request)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(async response => {
        if (isCacheableResponse(request, response)) {
          const copy = response.clone();
          await caches.open(CACHE_NAME).then(cache => cache.put('/', copy)).catch(() => {});
        }
        return response;
      }).catch(async () => (await caches.match('/')) || Response.error())
    );
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (isCacheableResponse(request, response)) {
      const copy = response.clone();
      await caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => {});
    }
    return response;
  })());
});
