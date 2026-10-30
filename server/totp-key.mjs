import { randomBytes } from 'node:crypto';
import { chmod, mkdir, open, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const KEY_BYTES = 32;
const KEY_FILE = 'totp-encryption.key';

/** Load or create the private installation key used to encrypt stored TOTP seeds. */
export async function loadOrCreateTotpEncryptionKey(dataDirectory) {
  const directory = resolve(dataDirectory);
  await mkdir(directory, { recursive: true });
  const path = join(directory, KEY_FILE);
  let handle;
  try {
    handle = await open(path, 'wx', 0o600);
    const key = randomBytes(KEY_BYTES);
    await handle.writeFile(key);
    await handle.sync();
    return key;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  } finally {
    await handle?.close();
  }

  const key = await readFile(path);
  if (key.length !== KEY_BYTES) throw new Error('TOTP 加密密钥文件无效；为避免锁定账号，服务已拒绝继续');
  if (process.platform !== 'win32') await chmod(path, 0o600);
  return key;
}
