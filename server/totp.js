import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export function encodeBase32(input) {
  const bytes = Buffer.from(input);
  let output = '', value = 0, bits = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32[(value >>> bits) & 31];
      value &= (1 << bits) - 1;
    }
  }
  if (bits) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function decodeBase32(input) {
  const value = String(input ?? '').toUpperCase();
  const match = /^([A-Z2-7]*)(={0,6})$/.exec(value);
  if (!match) throw new TypeError('Base32 密钥格式无效');
  const [, symbols, padding] = match;
  const remainder = symbols.length % 8;
  if ([1, 3, 6].includes(remainder)) throw new TypeError('Base32 密钥长度无效');
  const expectedPadding = ({ 0: 0, 2: 6, 4: 4, 5: 3, 7: 1 })[remainder];
  if ((padding.length && (value.length % 8 !== 0 || padding.length !== expectedPadding))
      || (!padding.length && remainder === 0 && symbols.length === 0 && value !== '')) {
    throw new TypeError('Base32 填充无效');
  }

  const bytes = [];
  let accumulator = 0, bits = 0;
  for (const symbol of symbols) {
    const digit = BASE32.indexOf(symbol);
    if (digit < 0) throw new TypeError('Base32 密钥格式无效');
    accumulator = (accumulator << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >>> bits) & 0xff);
      accumulator &= (1 << bits) - 1;
    }
  }
  if (bits && accumulator !== 0) throw new TypeError('Base32 尾部填充位无效');
  return Uint8Array.from(bytes);
}

export function generateTotpSecret() {
  return encodeBase32(randomBytes(20));
}

export function totpCounterForCode(secret, code, now = Date.now(), window = 1) {
  if (!/^\d{6}$/.test(String(code ?? '')) || !Number.isFinite(now) || !Number.isInteger(window) || window < 0 || window > 2) return null;
  const key = decodeBase32(secret);
  if (key.length < 16) return null;
  const current = Math.floor(now / 1000 / STEP_SECONDS);
  let accepted = null;
  for (let offset = -window; offset <= window; offset++) {
    const counter = current + offset;
    if (counter < 0) continue;
    const message = Buffer.alloc(8);
    message.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac('sha1', key).update(message).digest();
    const offsetInDigest = digest[digest.length - 1] & 0x0f;
    const binary = digest.readUInt32BE(offsetInDigest) & 0x7fffffff;
    const expected = Buffer.from(String(binary % (10 ** DIGITS)).padStart(DIGITS, '0'));
    const supplied = Buffer.from(String(code));
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) accepted = counter;
  }
  return accepted;
}

export function verifyTotpCode(secret, code, now = Date.now(), lastCounter = -1) {
  if (!Number.isSafeInteger(lastCounter)) return null;
  const counter = totpCounterForCode(secret, code, now);
  return counter !== null && counter > lastCounter ? counter : null;
}

export function generateRecoveryCodes(count = 10) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 20) throw new RangeError('恢复码数量无效');
  return Array.from({ length: count }, () => encodeBase32(randomBytes(10)));
}

export function hashRecoveryCode(code) {
  const normalized = String(code ?? '').toUpperCase().replace(/[\s-]/g, '');
  if (!/^[A-Z2-7]{16}$/.test(normalized)) return null;
  return createHash('sha256').update(normalized, 'ascii').digest('hex');
}

export function createTotpUri(secret, account, issuer = '栖点') {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const query = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${query}`;
}

export function encryptTotpSecret(secret, key) {
  const encryptionKey = Buffer.from(key);
  if (encryptionKey.length !== 32) throw new TypeError('TOTP 加密密钥必须为 32 字节');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url')
  };
}

export function decryptTotpSecret(encrypted, key) {
  const encryptionKey = Buffer.from(key);
  if (encryptionKey.length !== 32 || !encrypted || typeof encrypted !== 'object') throw new TypeError('TOTP 密钥数据无效');
  const iv = Buffer.from(String(encrypted.iv || ''), 'base64url');
  const ciphertext = Buffer.from(String(encrypted.ciphertext || ''), 'base64url');
  const tag = Buffer.from(String(encrypted.tag || ''), 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 1) throw new TypeError('TOTP 密钥数据无效');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
