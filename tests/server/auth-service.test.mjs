import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthService } from '../../server/application/auth-service.js';
import { PASSWORD_ITERATIONS, SESSION_IDLE_TTL } from '../../server/auth.js';

const salt = btoa('s'.repeat(16));
const verifier = btoa('v'.repeat(32));

function makeService({ account = null, firstAccount = null, claim = null, legacyData = null, challenge = null,
  challengeAccount = null, hasVault = true, consumeChanges = 1 } = {}) {
  const calls = {};
  const repository = {
    findLegacyDataForFirstOwner: async () => legacyData,
    findRegistrationName: async (_db, username) => {
      calls.registrationName = username;
      return { results: [] };
    },
    findLegacyClaim: async () => claim,
    createRegisteredAccount: async (_db, input) => {
      calls.registration = input;
      return [{ meta: { changes: 1 } }, { meta: { changes: 0 } }];
    },
    findAccountByNormalizedUsername: async () => account,
    createAuthChallenge: async (_db, input) => { calls.challenge = input; },
    findAuthChallenge: async () => challenge,
    consumeAuthChallenge: async () => ({ meta: { changes: consumeChanges } }),
    findChallengeAccount: async () => challengeAccount,
    hasAccountVault: async () => hasVault,
    createSession: async (_db, input) => { calls.session = input; },
    deleteSession: async (_db, tokenHash) => { calls.deletedSession = tokenHash; }
  };
  const accounts = { findFirstAccount: async () => firstAccount };
  const service = createAuthService(repository, accounts, {
    now: () => 1000,
    createId: () => 'challenge-or-account-id',
    derivePasswordHash: async value => `hash:${value}`,
    deriveSessionHash: async value => `session-hash:${value}`,
    createSessionToken: () => 'raw-session-token',
    createSalt: async () => salt,
    comparePasswordHash: (actual, expected) => actual === expected,
    fallbackPasswordHash: () => 'dummy-password-hash'
  });
  return { service, calls };
}

test('registration policy opens first-owner setup and persists only hashed credentials', async () => {
  const { service, calls } = makeService();
  assert.deepEqual(await service.registrationState({}, { selfHosted: true }), { registrationEnabled: true, setupRequired: true });

  const result = await service.register({}, { username: '  Alice ', salt, verifier, iterations: PASSWORD_ITERATIONS }, { selfHosted: true });
  assert.deepEqual(result, { id: 'challenge-or-account-id', username: 'alice', legacyClaimed: false, sessionToken: 'raw-session-token' });
  assert.equal(calls.registrationName, 'alice');
  assert.equal(calls.registration.passwordHash, `hash:${verifier}`);
  assert.equal(calls.registration.salt, salt);
  assert.equal(calls.registration.tokenHash, 'session-hash:raw-session-token');
  assert.equal(calls.registration.sessionExpires, 1000 + SESSION_IDLE_TTL);
});

test('registration remains closed for existing private installs unless explicitly enabled', async () => {
  const { service } = makeService({ firstAccount: { id: 'owner' } });
  await assert.rejects(
    service.register({}, { username: 'alice', salt, verifier, iterations: PASSWORD_ITERATIONS }, {}),
    error => error.status === 403
  );
});

test('challenge login consumes a one-time challenge and creates an idle session', async () => {
  const challenge = { id: 'challenge-id', account_id: 'account-id' };
  const { service, calls } = makeService({
    account: { id: 'account-id', username_normalized: 'alice', password_salt: salt },
    challenge,
    challengeAccount: { id: 'account-id', password_hash: `hash:${verifier}` }
  });
  assert.deepEqual(await service.createChallenge({}, 'alice'), { id: 'challenge-or-account-id', salt, iterations: PASSWORD_ITERATIONS });
  assert.equal(calls.challenge.accountId, 'account-id');

  assert.deepEqual(await service.verifyChallenge({}, { id: 'challenge-id', verifier }), { id: 'account-id', sessionToken: 'raw-session-token' });
  assert.equal(calls.session.tokenHash, 'session-hash:raw-session-token');
  assert.equal(calls.session.accountId, 'account-id');
  assert.equal(calls.session.expires, 1000 + SESSION_IDLE_TTL);
});

test('unknown-account challenge follows the same failed verification response', async () => {
  const { service } = makeService({
    challenge: { id: 'challenge-id', account_id: null }
  });
  await assert.rejects(service.verifyChallenge({}, { id: 'challenge-id', verifier }), error => error.status === 401);
});

test('a challenge already consumed by another request cannot create another session', async () => {
  const { service, calls } = makeService({
    challenge: { id: 'challenge-id', account_id: 'account-id' },
    consumeChanges: 0,
    challengeAccount: { id: 'account-id', password_hash: `hash:${verifier}` }
  });
  await assert.rejects(service.verifyChallenge({}, { id: 'challenge-id', verifier }), error => error.status === 401);
  assert.equal(calls.session, undefined);
});
