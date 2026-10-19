import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignOutFlow } from '../src/features/account/sign-out-flow.ts';

function harness({ editing = false, flushResult = true, logoutError = null } = {}) {
  const events = [];
  const flow = createSignOutFlow({
    isEditing: () => editing,
    clearAutosave: () => events.push('clear-autosave'),
    saveDraft: () => events.push('save-draft'),
    flush: async () => { events.push('flush'); return flushResult; },
    logout: async () => { events.push('logout'); if (logoutError) throw logoutError; },
    reload: () => events.push('reload'),
    notify: message => events.push(['notify', message]),
  });
  return { flow, events };
}

test('sign out saves an active draft and flushes queued writes before logout and reload', async () => {
  const h = harness({ editing: true });

  assert.equal(await h.flow.run(), true);
  assert.deepEqual(h.events, ['clear-autosave', 'save-draft', 'flush', 'logout', 'reload']);
});

test('sign out stays in the workspace when pending writes cannot be flushed', async () => {
  const h = harness({ editing: true, flushResult: false });

  assert.equal(await h.flow.run(), false);
  assert.deepEqual(h.events, [
    'clear-autosave', 'save-draft', 'flush',
    ['notify', '修改暂未写入；请到设置中重试保存后再退出'],
  ]);
});

test('sign out reports logout failures and does not reload the page', async () => {
  const h = harness({ logoutError: new Error('退出失败') });

  assert.equal(await h.flow.run(), false);
  assert.deepEqual(h.events, ['flush', 'logout', ['notify', '退出失败']]);
});
