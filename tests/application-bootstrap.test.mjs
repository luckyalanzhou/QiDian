import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapApplication } from '../src/features/auth/application-bootstrap.ts';

test('successful startup launches the workspace with the current session', async () => {
  const session = { id:'account-1', username:'owner' };
  const showAuthentication = async () => {};
  const launched = [];
  await bootstrapApplication({
    bootstrap: async () => session,
    showAuthentication,
    showStartupError: error => { throw error; },
    launchWorkspace: (...args) => launched.push(args)
  });
  assert.deepEqual(launched, [[session, showAuthentication]]);
});

test('an unauthenticated startup opens the in-app authentication flow with server policy', async () => {
  const sessionConfig = { registrationEnabled:false, setupRequired:false };
  const shown = [];
  const launched = [];
  await bootstrapApplication({
    bootstrap: async () => { throw Object.assign(new Error('需要登录'), { status:401, details:sessionConfig }); },
    showAuthentication: async config => shown.push(config),
    showStartupError: error => { throw error; },
    launchWorkspace: session => launched.push(session)
  });
  assert.deepEqual(shown, [sessionConfig]);
  assert.deepEqual(launched, []);
});

test('non-authentication startup errors stay in the application error surface', async () => {
  const failure = new Error('服务暂不可用');
  const reported = [];
  const shown = [];
  await bootstrapApplication({
    bootstrap: async () => { throw failure; },
    showAuthentication: async config => shown.push(config),
    showStartupError: error => reported.push(error),
    launchWorkspace: () => assert.fail('a failed startup cannot mount the workspace')
  });
  assert.deepEqual(reported, [failure]);
  assert.deepEqual(shown, []);
});
