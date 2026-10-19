import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createViteTestServer as createServer } from './vite-test-server.mjs';
import { fileURLToPath } from 'node:url';

test('reader heading observer synchronizes both outlines and cleans up its observer', async t => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom'
  });
  t.after(() => server.close());

  const { mountHeadingObserver } = await server.ssrLoadModule('/src/features/reader/heading-observer.ts');
  const dom = new JSDOM(`
    <main class="reader-shell">
      <nav class="outline"><a href="#first"></a><a href="#second"></a></nav>
      <article><h2 id="first">First</h2><h2 id="second">Second</h2></article>
      <nav class="outline"><a href="#first"></a><a href="#second"></a></nav>
    </main>
  `);
  t.after(() => dom.window.close());

  const root = dom.window.document.querySelector('main');
  const headings = [...root.querySelectorAll('article h2')];
  const links = [...root.querySelectorAll('.outline a')];
  const updates = [];
  const observed = [];
  let callback;
  let disconnected = false;
  const cleanup = mountHeadingObserver(headings, links, id => updates.push(id), (next, options) => {
    callback = next;
    assert.equal(options.rootMargin, '-14% 0px -74% 0px');
    return {
      observe: heading => observed.push(heading.id),
      disconnect: () => { disconnected = true; }
    };
  });

  assert.deepEqual(updates, ['first']);
  assert.deepEqual(observed, ['first', 'second']);
  assert.equal(links[0].getAttribute('aria-current'), 'location');
  assert.equal(links[2].classList.contains('current'), true);

  callback([
    { isIntersecting: true, target: headings[1], boundingClientRect: { top: 80 } },
    { isIntersecting: true, target: headings[0], boundingClientRect: { top: 20 } }
  ]);
  assert.deepEqual(updates, ['first', 'first']);

  callback([{ isIntersecting: true, target: headings[1], boundingClientRect: { top: 5 } }]);
  assert.deepEqual(updates, ['first', 'first', 'second']);
  assert.equal(links[1].getAttribute('aria-current'), 'location');
  assert.equal(links[3].classList.contains('current'), true);
  assert.equal(links[0].hasAttribute('aria-current'), false);

  cleanup();
  assert.equal(disconnected, true);
});

test('reader heading observer still selects the first section when IntersectionObserver is unavailable', async t => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom'
  });
  t.after(() => server.close());

  const { mountHeadingObserver } = await server.ssrLoadModule('/src/features/reader/heading-observer.ts');
  const dom = new JSDOM('<main><h2 id="only">Only</h2><a href="#only"></a></main>');
  t.after(() => dom.window.close());
  const root = dom.window.document.querySelector('main');
  const links = [...root.querySelectorAll('a')];
  const updates = [];

  const cleanup = mountHeadingObserver([...root.querySelectorAll('h2')], links, id => updates.push(id), null);
  assert.deepEqual(updates, ['only']);
  assert.equal(links[0].getAttribute('aria-current'), 'location');
  cleanup();
});
