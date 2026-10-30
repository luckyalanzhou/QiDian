import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountService } from '../../server/application/account-service.js';
import { PASSWORD_ITERATIONS, bytesToBase64, hashPasswordVerifier } from '../../server/auth.js';

function verifier(fill) {
  return bytesToBase64(new Uint8Array(32).fill(fill));
}

test('account service maps private profile and avatar repository records to application results', async () => {
  const saved = [];
  const service = createAccountService({
    findAccountProfile: async () => ({ id: 'account-1', username: 'reader', created: 10, avatar_mime: null }),
    findAccountAvatar: async () => ({ avatar: new Uint8Array([1, 2, 3]), avatar_mime: 'image/png' }),
    saveAccountAvatar: async (db, value) => saved.push(value),
    clearAccountAvatar: async (db, accountId, updated) => saved.push({ accountId, updated })
  }, { now: () => 123 });

  assert.deepEqual(await service.readProfile({}, 'account-1'), {
    id: 'account-1', username: 'reader', created: 10, avatarMime: null, totpEnabled: false
  });
  assert.deepEqual(await service.readAvatar({}, 'account-1'), { bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' });
  assert.deepEqual(await service.saveAvatar({}, 'account-1', new Uint8Array([4]).buffer, 'image/webp'), { ok: true, mime: 'image/webp' });
  assert.deepEqual(await service.clearAvatar({}, 'account-1'), { ok: true });
  assert.equal(saved[0].updated, 123);
  assert.deepEqual(saved[1], { accountId: 'account-1', updated: 123 });
});

test('password changes verify the current credential and require the conditional repository transaction', async () => {
  const currentVerifier = verifier(3);
  const nextVerifier = verifier(8);
  let currentHash = await hashPasswordVerifier(currentVerifier);
  const updates = [];
  const repository = {
    findAccountPasswordHash: async () => ({ password_hash: currentHash }),
    updateAccountPassword: async (db, input) => {
      updates.push(input);
      if (input.expectedHash !== currentHash) return [{ meta: { changes: 0 } }];
      currentHash = input.hash;
      return [{ meta: { changes: 1 } }];
    }
  };
  const service = createAccountService(repository);
  const input = {
    iterations: PASSWORD_ITERATIONS,
    salt: bytesToBase64(new Uint8Array(16).fill(1)),
    currentVerifier,
    verifier: nextVerifier
  };

  await assert.rejects(service.changePassword({}, 'account-1', { ...input, currentVerifier: verifier(4) }, 'session-hash'), error => error.status === 403);
  assert.equal(updates.length, 0, 'an incorrect current password does not mutate account credentials');

  assert.deepEqual(await service.changePassword({}, 'account-1', input, 'session-hash'), { ok: true, otherSessionsRevoked: true });
  assert.equal(currentHash, await hashPasswordVerifier(nextVerifier));
  assert.equal(updates[0].currentSessionHash, 'session-hash');
  assert.equal(updates[0].iterations, PASSWORD_ITERATIONS);

  repository.updateAccountPassword = async () => [{ meta: { changes: 0 } }];
  await assert.rejects(service.changePassword({}, 'account-1', { ...input, currentVerifier: nextVerifier }, 'session-hash'), error => error.status === 409);
});
