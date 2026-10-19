import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorPageLifecycle } from '../src/features/editor/page-lifecycle.ts';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('editor page lifecycle coalesces concurrent loads and mounts only once when active', async () => {
  const load = deferred();
  const calls = [];
  let factory = null;
  const lifecycle = createEditorPageLifecycle({
    getFactory: () => factory,
    loadFactory: () => { calls.push('load'); return load.promise.then(value => { factory = value; return value; }); },
    isActive: () => true,
    mount: () => { calls.push('mount'); return 'editor'; },
    focusTitle: () => calls.push('focus'),
    onLoadError: error => calls.push(['error', error])
  });

  const first = lifecycle.initialize();
  const second = lifecycle.initialize();
  assert.equal(first, second);
  assert.deepEqual(calls, ['load']);

  load.resolve(() => 'editor');
  await first;
  assert.deepEqual(calls, ['load', 'mount', 'focus']);
  assert.equal(lifecycle.initialize(), 'editor', 'an already loaded factory mounts synchronously');
  assert.deepEqual(calls, ['load', 'mount', 'focus', 'mount']);
});

test('editor page lifecycle does not mount or focus after navigation leaves during loading', async () => {
  const load = deferred();
  const calls = [];
  let active = true;
  const lifecycle = createEditorPageLifecycle({
    getFactory: () => null,
    loadFactory: () => load.promise,
    isActive: () => active,
    mount: () => calls.push('mount'),
    focusTitle: () => calls.push('focus'),
    onLoadError: error => calls.push(['error', error])
  });

  const pending = lifecycle.initialize();
  active = false;
  load.resolve(() => 'editor');
  await pending;
  assert.deepEqual(calls, []);
});

test('editor page lifecycle reports load errors and permits a later retry', async () => {
  const calls = [];
  let attempts = 0;
  const failure = new Error('chunk unavailable');
  const lifecycle = createEditorPageLifecycle({
    getFactory: () => null,
    loadFactory: () => {
      attempts += 1;
      return attempts === 1 ? Promise.reject(failure) : Promise.resolve(() => 'editor');
    },
    isActive: () => true,
    mount: () => calls.push('mount'),
    focusTitle: () => calls.push('focus'),
    onLoadError: error => calls.push(['error', error])
  });

  await lifecycle.initialize();
  assert.deepEqual(calls, [['error', failure]]);
  await lifecycle.initialize();
  assert.deepEqual(calls, [['error', failure], 'mount', 'focus']);
});
