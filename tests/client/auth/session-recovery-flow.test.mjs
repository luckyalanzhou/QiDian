import test from 'node:test';
import assert from 'node:assert/strict';
import { connectSessionRecoveryFlow } from '../../../src/features/auth/session-recovery-flow.ts';

function harness(options = {}) {
  let listener;
  let authentication;
  const applied = [];
  const notifications = [];
  const flow = connectSessionRecoveryFlow({
    subscribe: callback => { listener = callback; },
    showAuthentication: (config, recovery) => {
      if (options.openError) return Promise.reject(options.openError);
      authentication = { config, recovery };
      return Promise.resolve();
    },
    authenticate: async username => ({ data: { notes: [] }, username }),
    username: options.username || 'alan',
    applyAuthenticated: result => applied.push(result),
    notify: message => notifications.push(message)
  });
  return {
    flow, applied, notifications,
    get authentication() { return authentication; },
    requireAuthentication() { listener(); }
  };
}

test('expired sessions open one recovery prompt with the same account and apply its result once', async () => {
  const h = harness();
  h.requireAuthentication();
  h.requireAuthentication();
  await Promise.resolve();

  assert.equal(h.authentication.config, null);
  assert.equal(h.authentication.recovery.username, 'alan');
  assert.equal(h.authentication.recovery.authenticate instanceof Function, true);
  const result = { data: { notes: [{ id: 'kept' }] }, conflict: false };
  await h.authentication.recovery.onAuthenticated(result);
  assert.deepEqual(h.applied, [result]);
  assert.equal(h.flow.isPromptOpen(), false);
});

test('a synchronization conflict does not replace the current workspace', async () => {
  const h = harness();
  h.requireAuthentication();
  await Promise.resolve();
  await h.authentication.recovery.onAuthenticated({ data: { notes: [] }, conflict: true });
  assert.deepEqual(h.applied, []);
});

test('a failed prompt resets the guard and reports the failure so another attempt can open', async () => {
  const h = harness({ openError: new Error('窗口失败') });
  h.requireAuthentication();
  await Promise.resolve();
  assert.equal(h.flow.isPromptOpen(), false);
  assert.deepEqual(h.notifications, ['窗口失败']);
});
