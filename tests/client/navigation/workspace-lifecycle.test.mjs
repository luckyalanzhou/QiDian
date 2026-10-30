import test from 'node:test';
import assert from 'node:assert/strict';
import { mountWorkspaceLifecycle } from '../../../src/features/lifecycle/workspace-lifecycle.ts';

function createHarness(visibilityState = 'visible') {
  const listeners = new Map();
  const timers = new Map();
  let nextTimer = 0;
  const document = {
    visibilityState,
    addEventListener(name, listener) {
      const bucket = listeners.get(name) || new Set();
      bucket.add(listener);
      listeners.set(name, bucket);
    },
    removeEventListener(name, listener) {
      listeners.get(name)?.delete(listener);
    }
  };
  const window = {
    setInterval(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, delay });
      return id;
    },
    clearInterval(id) {
      timers.delete(id);
    }
  };
  return {
    document,
    window,
    listeners,
    timers,
    dispatchVisibility(state) {
      document.visibilityState = state;
      for (const listener of listeners.get('visibilitychange') || []) listener(new Event('visibilitychange'));
    }
  };
}

test('workspace lifecycle refreshes cloud and prunes expired trash while visible', () => {
  const harness = createHarness();
  let refreshes = 0;
  let prunes = 0;
  mountWorkspaceLifecycle({
    ...harness,
    isLocal: false,
    refreshCloud: () => { refreshes += 1; },
    pruneExpiredTrash: () => { prunes += 1; },
    cloudRefreshIntervalMs: 2500,
    trashPruneIntervalMs: 60000
  });

  assert.deepEqual([...harness.timers.values()].map(timer => timer.delay), [2500, 60000]);
  assert.equal(harness.listeners.get('visibilitychange').size, 1);
  harness.dispatchVisibility('hidden');
  assert.equal(refreshes, 0);
  assert.equal(prunes, 0);
  harness.dispatchVisibility('visible');
  assert.equal(refreshes, 1);
  assert.equal(prunes, 1);
  for (const timer of harness.timers.values()) timer.callback();
  assert.equal(refreshes, 2);
  assert.equal(prunes, 2);
});

test('local preview prunes trash without starting cloud polling', () => {
  const harness = createHarness();
  let refreshes = 0;
  let prunes = 0;
  mountWorkspaceLifecycle({
    ...harness,
    isLocal: true,
    refreshCloud: () => { refreshes += 1; },
    pruneExpiredTrash: () => { prunes += 1; }
  });

  assert.equal(harness.timers.size, 1);
  harness.dispatchVisibility('visible');
  for (const timer of harness.timers.values()) timer.callback();
  assert.equal(refreshes, 0);
  assert.equal(prunes, 2);
});

test('workspace lifecycle cleanup removes visibility listeners and intervals', () => {
  const harness = createHarness();
  let refreshes = 0;
  let prunes = 0;
  const unmount = mountWorkspaceLifecycle({
    ...harness,
    isLocal: false,
    refreshCloud: () => { refreshes += 1; },
    pruneExpiredTrash: () => { prunes += 1; }
  });

  unmount();
  harness.dispatchVisibility('visible');
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.listeners.get('visibilitychange').size, 0);
  assert.equal(refreshes, 0);
  assert.equal(prunes, 0);
});
