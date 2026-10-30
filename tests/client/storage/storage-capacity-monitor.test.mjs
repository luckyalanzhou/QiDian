import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorageCapacityMonitor } from '../../../src/features/storage/storage-capacity-monitor.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function harness(read, onUpdate) {
  const updates = [], timers = new Map();
  let nextTimer = 1;
  const monitor = createStorageCapacityMonitor({
    enabled: () => true,
    visible: () => true,
    read,
    update: onUpdate ?? (capacity => updates.push(capacity)),
    setInterval: (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, delay }); return id; },
    clearInterval: id => timers.delete(id)
  });
  return { monitor, updates, timers };
}

test('a superseded capacity response cannot overwrite a newer warning', async () => {
  const first = deferred(), second = deferred(), signals = [];
  let reads = 0;
  const { monitor, updates } = harness(signal => {
    signals.push(signal);
    return [first.promise, second.promise][reads++];
  });

  const olderRequest = monitor.refresh();
  const newerRequest = monitor.refresh();
  assert.equal(signals[0].aborted, true);
  const warning = { usedPercent: 73.25, warning: true };
  second.resolve(warning);
  await newerRequest;
  first.resolve({ usedPercent: 25, warning: false });
  await olderRequest;

  assert.deepEqual(updates, [warning]);
});
test('stopping monitoring invalidates an in-flight response and clears its timer', async () => {
  const pending = deferred();
  let requestSignal;
  const { monitor, updates, timers } = harness(signal => { requestSignal = signal; return pending.promise; });
  monitor.start();
  assert.equal(timers.size, 1);
  monitor.stop();
  assert.equal(requestSignal.aborted, true);
  pending.resolve({ usedPercent: 90, warning: true });
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(updates, [null, null]);
  assert.equal(timers.size, 0);
});

test('a successful low-capacity read clears the stale warning', async () => {
  const warning = { usedPercent: 75, warning: true };
  const lowCapacity = { usedPercent: 25, warning: false };
  const states = [];
  let reads = 0;
  const { monitor } = harness(async () => {
    if (++reads === 1) return warning;
    if (reads === 2) throw new Error('temporarily unavailable');
    return lowCapacity;
  }, (capacity, stale = false) => states.push({ capacity, stale }));

  await monitor.refresh();
  await monitor.refresh();
  await monitor.refresh();

  assert.deepEqual(states, [
    { capacity: warning, stale: false },
    { capacity: warning, stale: true },
    { capacity: lowCapacity, stale: false }
  ]);
});

test('a failed refresh preserves the last high-capacity warning and marks it stale', async () => {
  const warning = { usedPercent: 75, warning: true };
  const states = [];
  let reads = 0;
  const { monitor } = harness(async () => {
    if (++reads === 1) return warning;
    throw new Error('temporarily unavailable');
  }, (capacity, stale = false) => states.push({ capacity, stale }));

  await monitor.refresh();
  await monitor.refresh();

  assert.deepEqual(states, [
    { capacity: warning, stale: false },
    { capacity: warning, stale: true }
  ]);
});

test('a failed first read reports unavailable capacity without inventing a low sample', async () => {
  const states = [];
  const { monitor } = harness(async () => { throw new Error('temporarily unavailable'); },
    (capacity, stale = false) => states.push({ capacity, stale }));

  await monitor.refresh();

  assert.deepEqual(states, [{ capacity: null, stale: true }]);
});
