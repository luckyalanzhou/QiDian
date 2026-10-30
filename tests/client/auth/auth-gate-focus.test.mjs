import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { nextTick, reactive } from 'vue';
import { focusUsernameWhenAuthModeChanges } from '../../../src/features/auth/auth-mode-focus.ts';

test('authentication mode changes focus the username field after the form updates', async () => {
  const { document } = new JSDOM('<body><input id="authUsername"><button id="authRegister">注册</button></body>').window;
  const state = reactive({ mode: 'login' });
  const stop = focusUsernameWhenAuthModeChanges(() => state.mode, () => document.querySelector('#authUsername'));
  try {
    document.querySelector('#authRegister').focus();
    state.mode = 'register';
    await nextTick();
    await nextTick();
    assert.equal(document.activeElement.id, 'authUsername');
    state.mode = 'login';
    await nextTick();
    await nextTick();
    assert.equal(document.activeElement.id, 'authUsername');
  } finally {
    stop();
    document.defaultView.close();
  }
});
