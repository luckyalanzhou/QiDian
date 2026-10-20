import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveVerifierFallback, makeLoginVerifier, PASSWORD_ITERATIONS, validateNewPassword } from '../../../src/features/auth/credentials.js';
import { deriveVerifierWithWasm } from '../../../src/features/auth/credentials-wasm.js';

test('new passwords need eight characters and any two of four character classes', () => {
  for (const password of ['Abcdefg1', 'abcdefg!', 'ABCDEFG!', '1234567!', '中文密码测试Aa']) {
    assert.doesNotThrow(() => validateNewPassword(password), password);
  }
  for (const password of ['Abc123!', 'abcdefgh', 'ABCDEFGH', '12345678', '        ']) {
    assert.throws(() => validateNewPassword(password), password);
  }
  assert.throws(() => validateNewPassword('A'.repeat(129)), /最多 128/);
});

test('login continues to accept an existing password outside the new creation policy', async () => {
  const salt = btoa(String.fromCharCode(...new Uint8Array(16)));
  await assert.doesNotReject(makeLoginVerifier('legacy lowercase password', salt));
});

test('HTTP fallback derives the same PBKDF2 verifier as Web Crypto', async () => {
  const salt = Uint8Array.from({ length: 16 }, (_, index) => index * 7);
  for (const password of ['plain password', '密码🚀'.repeat(24), 'x'.repeat(120)]) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    for (const iterations of [1, 2, 257]) {
      const expected = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
      const actual = await deriveVerifierFallback(password, salt, iterations);
      assert.deepEqual(actual, expected, `iterations=${iterations}, passwordBytes=${new TextEncoder().encode(password).length}`);
    }
  }
  assert.equal(PASSWORD_ITERATIONS, 600_000);
});

test('WASM PBKDF2 matches Web Crypto without reducing iterations', async () => {
  const password = '栖点-WASM-Password-2026';
  const salt = Uint8Array.from({ length: 16 }, (_, index) => index + 3);
  const iterations = 2_000;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const expected = new Uint8Array(await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt, iterations }, key, 256));
  const actual = await deriveVerifierWithWasm(password, salt, iterations);
  assert.deepEqual(actual, expected);
  assert.equal(PASSWORD_ITERATIONS, 600_000);
});

test('HTTP login delegates the full-strength derivation to a worker when Web Crypto is unavailable', async () => {
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  const originalWorker = globalThis.Worker;
  let request, terminated = false;
  class TestWorker {
    postMessage(message) {
      request = message;
      const verifier = Uint8Array.from({ length:32 }, (_, index) => index).buffer;
      queueMicrotask(() => this.onmessage({ data:{ verifier } }));
    }
    terminate() { terminated = true; }
  }
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable:true, value:{} });
    globalThis.Worker = TestWorker;
    const verifier = await makeLoginVerifier('worker password', btoa(String.fromCharCode(...new Uint8Array(16))));
    assert.equal(verifier, btoa(String.fromCharCode(...Uint8Array.from({ length:32 }, (_, index) => index))));
    assert.equal(request.iterations, 600_000);
    assert.equal(request.password, 'worker password');
    assert.equal(new Uint8Array(request.salt).byteLength, 16);
    assert.equal(terminated, true);
  } finally {
    if (cryptoDescriptor) Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
    else delete globalThis.crypto;
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
  }
});
