import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { shouldRegisterPwa, registerPwa } from '../../../src/pwa/register.ts';

const read = path => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');

 test('PWA manifest declares a standalone Chinese app and supported icons', async () => {
  const manifest = JSON.parse(await read('public/manifest.webmanifest'));
  assert.equal(manifest.name, '栖点');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.map(icon => icon.sizes), ['192x192', '512x512', 'any']);
  assert.deepEqual(manifest.icons.map(icon => icon.purpose), ['any', 'any', 'maskable']);
  for (const [path, size] of [
    ['public/icons/qidian-apple-touch.png', 180],
    ['public/icons/qidian-180.png', 180],
    ['public/icons/qidian-192.png', 192],
    ['public/icons/qidian-512.png', 512]
  ]) {
    const icon = await readFile(new URL(`../../../${path}`, import.meta.url));
    assert.equal(icon.toString('ascii', 1, 4), 'PNG');
    assert.equal(icon.readUInt32BE(16), size);
    assert.equal(icon.readUInt32BE(20), size);
  }
  for (const path of ['public/icons/qidian-maskable.svg', 'public/icons/qidian.svg']) {
    const icon = await read(path);
    assert.match(icon, /href="data:image\/png;base64,/);
    assert.doesNotMatch(icon, /<text\b|栖/);
  }
  assert.match(await read('index.html'), /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(await read('index.html'), /rel="apple-touch-icon" sizes="180x180" href="\/icons\/qidian-apple-touch\.png"/);
});

test('Docker build context includes PWA manifest and icons in the production image', async () => {
  const dockerignore = await read('.dockerignore');
  const dockerfile = await read('Dockerfile');
  assert.match(dockerignore, /^!public$/m);
  assert.match(dockerignore, /^!public\/\*\*$/m);
  assert.match(dockerfile, /^COPY public \.\/public$/m);
});

test('PWA registers only in production secure contexts with service worker support', async () => {
  assert.equal(shouldRegisterPwa({ production: false, secureContext: true, serviceWorkerAvailable: true }), false);
  assert.equal(shouldRegisterPwa({ production: true, secureContext: false, serviceWorkerAvailable: true }), false);
  assert.equal(shouldRegisterPwa({ production: true, secureContext: true, serviceWorkerAvailable: false }), false);
  assert.equal(shouldRegisterPwa({ production: true, secureContext: true, serviceWorkerAvailable: true }), true);
  const calls = [];
  await registerPwa({ production: true, secureContext: true, serviceWorkerAvailable: true }, {
    register: async (...args) => { calls.push(args); return { active: true }; }
  });
  assert.deepEqual(calls, [['/sw.js', { scope: '/' }]]);
  assert.equal(await registerPwa({ production: false, secureContext: true, serviceWorkerAvailable: true }, { register() { throw Error('must not register in dev'); } }), null);
});

async function createWorker(source, fetchImpl = async () => { throw Error('offline'); }) {
  const events = new Map();
  const names = new Map([
    ['qidian-pwa-shell-previous', new Map()],
    ['other-app-cache', new Map()]
  ]);
  const deleted = [];
  const precached = [];
  let claimed = false;
  const caches = {
    async open(name) {
      if (!names.has(name)) names.set(name, new Map());
      const store = names.get(name);
      return {
        async addAll(urls) { precached.push(...urls); },
        async put(key, value) { store.set(key.url || String(key), value); },
        async match(key) { return store.get(key.url || String(key)); }
      };
    },
    async keys() { return [...names.keys()]; },
    async delete(name) { deleted.push(name); return names.delete(name); },
    async match(key) {
      for (const store of names.values()) if (store.has(key)) return store.get(key);
      return key === '/' ? { from: 'shell-cache' } : undefined;
    }
  };
  const self = {
    location: { origin: 'https://qidian.example' },
    clients: { async claim() { claimed = true; } },
    addEventListener(name, listener) { events.set(name, listener); }
  };
  vm.runInNewContext(source, { self, caches, URL, Response, Headers, fetch: fetchImpl });
  return { events, caches, names, deleted, precached, get claimed() { return claimed; } };
}

async function workerSource() {
  return (await read('src/pwa/service-worker.js')).replaceAll('__QIDIAN_PWA_VERSION__', 'test-version');
}

test('service worker precaches the public shell and removes only its own old cache', async () => {
  const worker = await createWorker(await workerSource());
  let installTask;
  worker.events.get('install')({ waitUntil(task) { installTask = task; } });
  await installTask;
  assert.ok(worker.precached.includes('/'));
  assert.ok(worker.precached.includes('/manifest.webmanifest'));
  assert.ok(worker.precached.includes('/icons/qidian-apple-touch.png'));
  assert.ok(worker.precached.includes('/icons/qidian-192.png'));
  assert.ok(worker.precached.every(path => !path.startsWith('/api/')));

  let activateTask;
  worker.events.get('activate')({ waitUntil(task) { activateTask = task; } });
  await activateTask;
  assert.deepEqual(worker.deleted, ['qidian-pwa-shell-previous']);
  assert.ok(worker.names.has('other-app-cache'));
  assert.equal(worker.claimed, true);
});

test('service worker never intercepts private API, cross-origin, query-bearing or non-GET requests', async () => {
  const worker = await createWorker(await workerSource());
  const fetchHandler = worker.events.get('fetch');
  for (const request of [
    { url: 'https://qidian.example/api/vault', method: 'GET', mode: 'cors' },
    { url: 'https://qidian.example/api/assets/private-file', method: 'GET', mode: 'cors' },
    { url: 'https://qidian.example/assets/app.js?account=private', method: 'GET', mode: 'cors' },
    { url: 'https://other.example/assets/app.js', method: 'GET', mode: 'cors' },
    { url: 'https://qidian.example/api/vault', method: 'POST', mode: 'cors' }
  ]) {
    let intercepted = false;
    fetchHandler({ request, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false, `${request.method} ${request.url} bypasses Cache API handling`);
  }
});

test('service worker serves the app shell for offline query-route navigations without caching route data', async () => {
  const worker = await createWorker(await workerSource(), async () => { throw Error('offline'); });
  let navigationResponse;
  worker.events.get('fetch')({
    request: { url: 'https://qidian.example/?qidian=note&note=private-note-id', method: 'GET', mode: 'navigate' },
    respondWith(response) { navigationResponse = response; }
  });

  assert.equal((await navigationResponse).from, 'shell-cache');
  assert.equal(worker.names.has('qidian-pwa-shell-test-version'), false);
});

test('online query-route navigation caches only the shared shell, not its private URL', async () => {
  const worker = await createWorker(await workerSource(), async () => ({
    ok: true,
    type: 'basic',
    headers: new Headers({ 'content-type': 'text/html' }),
    clone() { return this; }
  }));
  let navigationResponse;
  worker.events.get('fetch')({
    request: { url: 'https://qidian.example/?qidian=note&note=private-note-id', method: 'GET', mode: 'navigate' },
    respondWith(response) { navigationResponse = response; }
  });

  await navigationResponse;
  await Promise.resolve();
  const cachedKeys = [...worker.names.get('qidian-pwa-shell-test-version').keys()];
  assert.deepEqual(cachedKeys, ['/']);
  assert.equal(cachedKeys.some(key => String(key).includes('private-note-id')), false);
});

test('service worker falls back to the shell offline and caches validated static assets', async () => {
  let fetched = 0;
  const worker = await createWorker(await workerSource(), async request => {
    fetched += 1;
    if (request.mode === 'navigate') throw Error('offline');
    return { ok: true, type: 'basic', headers: new Headers({ 'content-type': 'text/javascript' }), clone() { return this; } };
  });
  const fetchHandler = worker.events.get('fetch');
  let navigationResponse;
  fetchHandler({
    request: { url: 'https://qidian.example/', method: 'GET', mode: 'navigate' },
    respondWith(response) { navigationResponse = response; }
  });
  assert.equal((await navigationResponse).from, 'shell-cache');

  let assetResponse;
  fetchHandler({
    request: { url: 'https://qidian.example/assets/app-hash.js', method: 'GET', mode: 'cors' },
    respondWith(response) { assetResponse = response; }
  });
  await assetResponse;
  await Promise.resolve();
  assert.equal(fetched, 2);
  assert.equal(worker.names.get('qidian-pwa-shell-test-version').size, 1);
  assert.equal(worker.names.get('qidian-pwa-shell-test-version').has('https://qidian.example/assets/app-hash.js'), true);
});
