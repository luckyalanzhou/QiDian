export const PASSWORD_ITERATIONS = 600_000;
const encoder = new TextEncoder();
const SHA256_INITIAL = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

function rotateRight(value, bits) { return (value >>> bits) | (value << (32 - bits)); }
function compressSha256(state, block, schedule) {
  for (let i = 0; i < 16; i++) {
    const offset = i * 4;
    schedule[i] = (block[offset] << 24) | (block[offset + 1] << 16) | (block[offset + 2] << 8) | block[offset + 3];
  }
  for (let i = 16; i < 64; i++) {
    const x = schedule[i - 15], y = schedule[i - 2];
    const s0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
    const s1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
    schedule[i] = (schedule[i - 16] + s0 + schedule[i - 7] + s1) >>> 0;
  }
  let [a, b, c, d, e, f, g, h] = state;
  for (let i = 0; i < 64; i++) {
    const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
    const choose = (e & f) ^ (~e & g);
    const t1 = (h + sum1 + choose + SHA256_K[i] + schedule[i]) >>> 0;
    const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
    const majority = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (sum0 + majority) >>> 0;
    h = g; g = f; f = e; e = (d + t1) >>> 0;
    d = c; c = b; b = a; a = (t1 + t2) >>> 0;
  }
  state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0;
  state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0;
  state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0;
  state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0;
}
function writeHash(state, output) {
  for (let i = 0; i < state.length; i++) {
    const word = state[i], offset = i * 4;
    output[offset] = word >>> 24; output[offset + 1] = word >>> 16;
    output[offset + 2] = word >>> 8; output[offset + 3] = word;
  }
}
function hashBytes(bytes, output, context) {
  context.state.set(SHA256_INITIAL);
  let offset = 0;
  while (offset + 64 <= bytes.length) {
    context.block.set(bytes.subarray(offset, offset + 64));
    compressSha256(context.state, context.block, context.schedule);
    offset += 64;
  }
  const remaining = bytes.length - offset;
  context.block.fill(0);
  context.block.set(bytes.subarray(offset), 0);
  context.block[remaining] = 0x80;
  if (remaining >= 56) {
    compressSha256(context.state, context.block, context.schedule);
    context.block.fill(0);
  }
  const bitLength = bytes.length * 8;
  context.block[56] = 0; context.block[57] = 0; context.block[58] = 0; context.block[59] = 0;
  context.block[60] = bitLength >>> 24; context.block[61] = bitLength >>> 16;
  context.block[62] = bitLength >>> 8; context.block[63] = bitLength;
  compressSha256(context.state, context.block, context.schedule);
  writeHash(context.state, output);
}
function hmacBase(key, pad, outputState, context) {
  for (let i = 0; i < 64; i++) context.block[i] = (key[i] || 0) ^ pad;
  outputState.set(SHA256_INITIAL);
  compressSha256(outputState, context.block, context.schedule);
}
function hmacFromBase(baseState, input, output, context) {
  context.state.set(baseState);
  context.block.fill(0);
  context.block.set(input);
  context.block[input.length] = 0x80;
  const bitLength = (64 + input.length) * 8;
  context.block[56] = 0; context.block[57] = 0; context.block[58] = 0; context.block[59] = 0;
  context.block[60] = bitLength >>> 24; context.block[61] = bitLength >>> 16;
  context.block[62] = bitLength >>> 8; context.block[63] = bitLength;
  compressSha256(context.state, context.block, context.schedule);
  writeHash(context.state, output);
}
function createHashContext() {
  return { block: new Uint8Array(64), schedule: new Uint32Array(64), state: new Uint32Array(8) };
}

function toBase64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
function fromBase64(value) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }
export function validateNewPassword(password) {
  const value = String(password ?? '');
  const length = [...value].length;
  if (length < 8) throw new Error('密码至少需要 8 个字符');
  if (length > 128) throw new Error('密码最多 128 个字符');
  const categories = [/[\p{Lu}]/u, /[\p{Ll}]/u, /[\p{N}]/u, /[\p{P}\p{S}]/u];
  if (categories.filter(pattern => pattern.test(value)).length < 2) {
    throw new Error('密码至少需要包含大写字母、小写字母、数字、符号中的任意两类');
  }
}
function validateLoginPassword(password) {
  const length = [...String(password ?? '')].length;
  if (length < 1) throw new Error('请输入密码');
  if (length > 128) throw new Error('密码最多 128 个字符');
}
async function deriveVerifier(password, salt) {
  const subtle = globalThis.crypto?.subtle;
  if (subtle?.importKey && subtle?.deriveBits) {
    const key = await subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS }, key, 256));
  }
  if (typeof globalThis.Worker === 'function') {
    try { return await deriveVerifierInWorker(password, salt); }
    catch { /* Older browsers keep the existing compatible implementation. */ }
  }
  return deriveVerifierFallback(password, salt);
}
function deriveVerifierInWorker(password, salt) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./credentials-worker.js', import.meta.url), { type: 'module', name: 'qidian-password' });
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      callback(value);
    };
    const timeout = setTimeout(() => finish(reject, new Error('密码校验计算超时')), 60_000);
    worker.onmessage = event => {
      if (event.data?.error) finish(reject, new Error(event.data.error));
      else if (event.data?.verifier) finish(resolve, new Uint8Array(event.data.verifier));
      else finish(reject, new Error('密码校验结果无效'));
    };
    worker.onerror = () => finish(reject, new Error('密码校验线程启动失败'));
    const saltCopy = salt.slice();
    try { worker.postMessage({ password, salt: saltCopy.buffer, iterations: PASSWORD_ITERATIONS }, [saltCopy.buffer]); }
    catch (error) { finish(reject, error); }
  });
}
export async function deriveVerifierFallback(password, salt, iterations = PASSWORD_ITERATIONS) {
  const context = createHashContext(), passwordBytes = encoder.encode(password);
  let key = passwordBytes;
  if (key.length > 64) {
    const hashed = new Uint8Array(32);
    hashBytes(key, hashed, context);
    key = hashed;
  }
  const innerBase = new Uint32Array(8), outerBase = new Uint32Array(8);
  hmacBase(key, 0x36, innerBase, context);
  hmacBase(key, 0x5c, outerBase, context);
  const saltAndCounter = new Uint8Array(salt.length + 4);
  saltAndCounter.set(salt);
  saltAndCounter.set([0, 0, 0, 1], salt.length);
  let current = new Uint8Array(32), next = new Uint8Array(32);
  hmacFromBase(innerBase, saltAndCounter, current, context);
  hmacFromBase(outerBase, current, next, context);
  [current, next] = [next, current];
  const result = current.slice();
  for (let round = 1; round < iterations; round++) {
    hmacFromBase(innerBase, current, next, context);
    hmacFromBase(outerBase, next, current, context);
    for (let i = 0; i < 32; i++) result[i] ^= current[i];
    if ((round & 8191) === 8191) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return result;
}
export async function makeRegistrationCredential(password) {
  validateNewPassword(password);
  if (!globalThis.crypto?.getRandomValues) throw new Error('当前浏览器不支持安全随机数，请升级浏览器');
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return { salt: toBase64(salt), verifier: toBase64(await deriveVerifier(password, salt)), iterations: PASSWORD_ITERATIONS };
}
export async function makeLoginVerifier(password, saltValue) {
  // Keep existing passwords usable if they do not meet the current creation policy.
  validateLoginPassword(password);
  const salt = fromBase64(saltValue), verifier = await deriveVerifier(password, salt);
  return toBase64(verifier);
}
