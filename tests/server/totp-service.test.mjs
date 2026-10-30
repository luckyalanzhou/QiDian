import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createTotpService } from '../../server/application/totp-service.js';
import { hashPasswordVerifier } from '../../server/auth.js';
import { decodeBase32, encryptTotpSecret, generateRecoveryCodes, generateTotpSecret } from '../../server/totp.js';

function codeAt(secret, now) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac('sha1', decodeBase32(secret)).update(message).digest();
  const offset = digest.at(-1) & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function setup(disableResult) {
  const now = 1_800_000_000_000;
  const encryptionKey = Buffer.alloc(32, 0x5a);
  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret, encryptionKey);
  const currentVerifier = Buffer.alloc(32, 0x31).toString('base64');
  const repository = {
    findTotpState: async () => ({ enabled:1, ...{
      secret_iv:encrypted.iv, secret_ciphertext:encrypted.ciphertext, secret_tag:encrypted.tag,
      last_counter:Math.floor(now / 30_000) - 1
    } }),
    disableTotpWithCounter: async (_db, args) => { repository.counterArgs=args; return disableResult; },
    disableTotpWithRecoveryCode: async (_db, args) => { repository.recoveryArgs=args; return disableResult; }
  };
  const accounts = { findAccountPasswordHash: async () => ({ password_hash:await hashPasswordVerifier(currentVerifier) }) };
  const service = createTotpService(repository, accounts, { now:() => now });
  return { service, repository, currentVerifier, encryptionKey, code:codeAt(secret,now), now };
}

test('valid TOTP disables MFA even when deleting multiple recovery-code rows', async () => {
  const result = [
    { meta:{ changes:1 } },
    { meta:{ changes:10 } },
    { meta:{ changes:0 } }
  ];
  const { service, repository, currentVerifier, encryptionKey, code, now } = await setup(result);
  assert.deepEqual(await service.disable({}, 'account-1', { currentVerifier, code }, encryptionKey), { ok:true, enabled:false });
  assert.equal(repository.counterArgs.counter, Math.floor(now / 30_000));
});

test('invalid or replayed TOTP does not report that MFA was disabled', async () => {
  const { service, currentVerifier, encryptionKey } = await setup([
    { meta:{ changes:0 } },
    { meta:{ changes:10 } },
    { meta:{ changes:0 } }
  ]);
  await assert.rejects(service.disable({}, 'account-1', { currentVerifier, code:'000000' }, encryptionKey), /验证码不正确或已使用/);
});

test('a one-time recovery code can disable MFA without the encryption key', async () => {
  const recoveryCode = generateRecoveryCodes(1)[0];
  const result = [
    { meta:{ changes:1 } },
    { meta:{ changes:1 } },
    { meta:{ changes:9 } },
    { meta:{ changes:0 } }
  ];
  const { service, repository, currentVerifier } = await setup(result);
  assert.deepEqual(await service.disable({}, 'account-1', { currentVerifier, code:recoveryCode }), { ok:true, enabled:false });
  assert.ok(repository.recoveryArgs.codeHash);
});
