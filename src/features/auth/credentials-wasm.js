import { createSHA256, pbkdf2 } from 'hash-wasm';

export async function deriveVerifierWithWasm(password, salt, iterations) {
  return pbkdf2({
    password,
    salt,
    iterations,
    hashLength: 32,
    hashFunction: createSHA256(),
    outputType: 'binary'
  });
}
