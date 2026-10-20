import { deriveVerifierWithWasm } from './credentials-wasm.js';

self.onmessage = async event => {
  const { password, salt, iterations } = event.data || {};
  try {
    const verifier = await deriveVerifierWithWasm(password, new Uint8Array(salt), iterations);
    self.postMessage({ verifier: verifier.buffer }, [verifier.buffer]);
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : '密码校验计算失败' });
  }
};
