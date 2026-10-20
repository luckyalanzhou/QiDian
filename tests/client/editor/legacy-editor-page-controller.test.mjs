import test from 'node:test';
import assert from 'node:assert/strict';
import { createLegacyEditorPageController } from '../../../src/compat/editor/legacy-page-controller.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('legacy editor page coalesces loading and renders once after the module is ready', async () => {
  const load = deferred();
  const calls = [];
  let factory = null;
  const page = createLegacyEditorPageController({
    getFactory: () => factory,
    setFactory: value => { factory = value; },
    loadFactory: () => { calls.push('load'); return load.promise; },
    isActive: () => true,
    renderLoading: () => calls.push('loading'),
    renderPage: () => calls.push('page'),
    focusTitle: () => calls.push('focus'),
    renderFailure: () => calls.push('failure'),
    onLoadError: error => calls.push(['error', error])
  });

  const first = page.render();
  const second = page.render();
  assert.equal(first, second);
  assert.deepEqual(calls, ['loading']);

  load.resolve(() => 'editor factory');
  await first;
  assert.deepEqual(calls, ['loading', 'load', 'page', 'focus']);
  assert.equal(factory(), 'editor factory');
  assert.equal(page.render(), 5, 'an already loaded factory renders synchronously');
  assert.deepEqual(calls, ['loading', 'load', 'page', 'focus', 'page']);
});

test('legacy editor page does not render or focus after navigation leaves during loading', async () => {
  const load = deferred();
  const calls = [];
  let active = true;
  const page = createLegacyEditorPageController({
    getFactory: () => null,
    setFactory: () => calls.push('factory'),
    loadFactory: () => load.promise,
    isActive: () => active,
    renderLoading: () => calls.push('loading'),
    renderPage: () => calls.push('page'),
    focusTitle: () => calls.push('focus'),
    renderFailure: () => calls.push('failure'),
    onLoadError: error => calls.push(['error', error])
  });

  const pending = page.render();
  active = false;
  load.resolve(() => 'editor factory');
  await pending;
  assert.deepEqual(calls, ['loading', 'factory']);
});

test('legacy editor page reports failures and allows a later load retry', async () => {
  const calls = [];
  const failure = new Error('chunk unavailable');
  let attempts = 0;
  let factory = null;
  const page = createLegacyEditorPageController({
    getFactory: () => factory,
    setFactory: value => { factory = value; },
    loadFactory: () => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(failure) : Promise.resolve(() => 'editor factory');
    },
    isActive: () => true,
    renderLoading: () => calls.push('loading'),
    renderPage: () => calls.push('page'),
    focusTitle: () => calls.push('focus'),
    renderFailure: () => calls.push('failure'),
    onLoadError: error => calls.push(['error', error])
  });

  await page.render();
  assert.deepEqual(calls, ['loading', 'failure', ['error', failure]]);
  await page.render();
  assert.deepEqual(calls, ['loading', 'failure', ['error', failure], 'loading', 'page', 'focus']);
  assert.equal(attempts, 2);
});
