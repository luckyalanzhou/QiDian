import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountSessionService } from '../src/features/auth/account-session-service.ts';

function service(overrides = {}) {
  const calls = [];
  const dependencies = {
    makeRegistrationCredential: async password => ({ salt: `salt-${password}`, verifier: `verifier-${password}`, iterations: 600000 }),
    makeLoginVerifier: async (password, salt) => `derived-${password}-${salt}`,
    registerWithCredential: async (username, credential) => { calls.push(['register', username, credential]); return { id: 'account-1', legacyClaimed: false }; },
    readLegacyDraft: async () => null,
    storeAccountDraft: async (draft, owner) => { calls.push(['move-draft', draft, owner]); },
    requestLoginChallenge: async username => { calls.push(['challenge', username]); return { id: 'challenge-1', salt: 'challenge-salt' }; },
    verifyLoginChallenge: async (id, verifier) => { calls.push(['verify', id, verifier]); return { id: 'account-1' }; },
    getAuthSession: async () => { calls.push(['session']); return { id: 'account-1', username: 'alan' }; },
    getPasswordSalt: async () => ({ salt: 'current-salt' }),
    updateAccountPassword: async input => { calls.push(['change-password', input]); return { ok: true }; },
    ...overrides
  };
  return { calls, instance: createAccountSessionService(dependencies) };
}

test('account registration transfers a pending legacy recovery draft only after account claim', async () => {
  const draft = { pending: true, revision: 4, data: { notes: [{ id: 'draft' }] } };
  const { calls, instance } = service({
    registerWithCredential: async () => ({ id: 'account-2', legacyClaimed: true }),
    readLegacyDraft: async () => draft
  });

  const result = await instance.registerAccount('alan', 'Valid-password-2!');
  assert.equal(result.id, 'account-2');
  assert.deepEqual(calls[0], ['move-draft', { ...draft, owner: 'account-2' }, 'account-2']);
});

test('login verifies the server challenge, confirms the cookie session and reports its stages', async () => {
  const stages = [];
  const { calls, instance } = service();

  const session = await instance.verifyAccount('alan', 'Valid-password-2!', stage => stages.push(stage));
  assert.equal(session.username, 'alan');
  assert.deepEqual(stages, ['challenge', 'derive', 'verify', 'load']);
  assert.deepEqual(calls, [
    ['challenge', 'alan'],
    ['verify', 'challenge-1', 'derived-Valid-password-2!-challenge-salt'],
    ['session']
  ]);
});

test('login rejects absent or mismatched cookie sessions without accepting the verifier alone', async () => {
  const absent = service({ getAuthSession: async () => { throw Object.assign(new Error('unauthorized'), { status: 401 }); } });
  await assert.rejects(absent.instance.verifyAccount('alan', 'password'), /没有建立登录会话/);

  const mismatched = service({ getAuthSession: async () => ({ id: 'account-2' }) });
  await assert.rejects(mismatched.instance.verifyAccount('alan', 'password'), /会话与当前账号不一致/);
});

test('password change verifies the current password and sends a fresh registration credential', async () => {
  const { calls, instance } = service();

  const result = await instance.changeAccountPassword('Old-password-2!', 'New-password-3!');
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls[0], ['change-password', {
    currentVerifier: 'derived-Old-password-2!-current-salt',
    salt: 'salt-New-password-3!',
    verifier: 'verifier-New-password-3!',
    iterations: 600000
  }]);
});
