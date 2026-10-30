import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  decodeBase32,
  encodeBase32,
  generateTotpSecret,
  totpCounterForCode,
  verifyTotpCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  encryptTotpSecret,
  decryptTotpSecret
} from '../../server/totp.js';

function referenceCode(secret, counter) {
  const key = Buffer.from(secret);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(message).digest();
  const offset = digest.at(-1) & 0x0f;
  const value = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 1_000_000).padStart(6, '0');
}

test('base32 encodes and decodes RFC 4648 vectors without padding', () => {
  for (const [plain, encoded] of [
    ['', ''], ['f', 'MY'], ['fo', 'MZXQ'], ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'], ['fooba', 'MZXW6YTB'], ['foobar', 'MZXW6YTBOI']
  ]) {
    assert.equal(encodeBase32(Buffer.from(plain)), encoded);
    assert.deepEqual(Buffer.from(decodeBase32(encoded)), Buffer.from(plain));
  }
  assert.deepEqual(Buffer.from(decodeBase32('mzxw6===')).toString(), 'foo');
  assert.throws(() => decodeBase32('MZ!W'), /Base32/);
});

test('TOTP matches RFC 6238 SHA-1 six-digit vectors', () => {
  const key = Buffer.from('12345678901234567890');
  const vectors = [
    [59, '94287082'], [1_111_111_109, '07081804'], [1_111_111_111, '14050471'],
    [1_234_567_890, '89005924'], [2_000_000_000, '69279037'], [20_000_000_000, '65353130']
  ];
  const encodedKey = encodeBase32(key);
  for (const [seconds, eightDigitCode] of vectors) {
    const expected = eightDigitCode.slice(-6);
    const counter = Math.floor(seconds / 30);
    assert.equal(totpCounterForCode(encodedKey, expected, seconds * 1000, 0), counter);
  }
});

test('verification accepts one adjacent time step and rejects replay or malformed codes', () => {
  const key = Buffer.from('01234567890123456789');
  const secret = encodeBase32(key);
  const now = 1_700_000_000_000;
  const current = Math.floor(now / 30_000);
  assert.equal(verifyTotpCode(secret, referenceCode(key, current - 1), now, current - 2), current - 1);
  assert.equal(verifyTotpCode(secret, referenceCode(key, current), now, current), null);
  assert.equal(verifyTotpCode(secret, referenceCode(key, current), now, current - 1), current);
  assert.equal(verifyTotpCode(secret, '12345', now, -1), null);
  assert.equal(verifyTotpCode(secret, 'abcdef', now, -1), null);
});

test('recovery codes are random, normalized for hashing, and independently verifiable', () => {
  const codes = generateRecoveryCodes(10);
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) {
    assert.match(code, /^[A-Z2-7]{16}$/);
    assert.equal(hashRecoveryCode(code), hashRecoveryCode(`${code.slice(0, 8)}-${code.slice(8)}`));
  }
  assert.notEqual(hashRecoveryCode(codes[0]), hashRecoveryCode(codes[1]));
});

test('TOTP secrets are authenticated-encrypted and reject a wrong key or tampering', () => {
  const key = Buffer.alloc(32, 0x31);
  const secret = generateTotpSecret();
  const encrypted = encryptTotpSecret(secret, key);
  assert.deepEqual(Object.keys(encrypted).sort(), ['ciphertext', 'iv', 'tag']);
  assert.equal(decryptTotpSecret(encrypted, key), secret);
  assert.throws(() => decryptTotpSecret(encrypted, Buffer.alloc(32, 0x32)));
  assert.throws(() => decryptTotpSecret({ ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -2)}AA` }, key));
});
