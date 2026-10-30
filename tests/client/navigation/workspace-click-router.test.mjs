import test from 'node:test';
import assert from 'node:assert/strict';
import { mountWorkspaceClickRouter } from '../../../src/features/navigation/workspace-click-router.ts';

function createDocument() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    dispatch(type, event) { return listeners.get(type)?.(event); },
    hasListener(type) { return listeners.has(type); }
  };
}

test('workspace click handlers run in order and stop after the first match', async () => {
  const document = createDocument();
  const calls = [];
  mountWorkspaceClickRouter(document, [
    event => { calls.push(['navigation', event]); return false; },
    async event => { calls.push(['toolbar', event]); return true; },
    event => { calls.push(['shell', event]); return true; }
  ]);

  const event = { target: {} };
  const pending = document.dispatch('click', event);
  assert.deepEqual(calls.map(([name]) => name), ['navigation', 'toolbar']);
  await pending;

  assert.deepEqual(calls.map(([name]) => name), ['navigation', 'toolbar']);
  assert.equal(calls[0][1], event);
});

test('unhandled clicks reach every handler and the mounted router can be removed', async () => {
  const document = createDocument();
  const calls = [];
  const unmount = mountWorkspaceClickRouter(document, [
    () => { calls.push('navigation'); return false; },
    () => { calls.push('content'); return false; }
  ]);

  const pending = document.dispatch('click', { target: null });
  assert.deepEqual(calls, ['navigation', 'content']);
  await pending;
  assert.equal(document.hasListener('click'), true);

  unmount();
  assert.equal(document.hasListener('click'), false);
});

test('empty workspace routes do not register a document click listener', () => {
  const document = createDocument();
  const unmount = mountWorkspaceClickRouter(document, []);
  assert.equal(document.hasListener('click'), false);
  unmount();
  assert.equal(document.hasListener('click'), false);
});
