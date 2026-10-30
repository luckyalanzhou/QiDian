import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadOrCreateTotpEncryptionKey } from '../../server/totp-key.mjs';

test('installation TOTP key is created once and reused after process restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qidian-totp-key-'));
  try {
    const first = await loadOrCreateTotpEncryptionKey(directory);
    const second = await loadOrCreateTotpEncryptionKey(directory);
    assert.equal(first.length, 32);
    assert.deepEqual(second, first);
    assert.deepEqual(await readFile(join(directory, 'totp-encryption.key')), first);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('corrupt installation key fails closed instead of replacing an existing key', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qidian-totp-key-'));
  const path = join(directory, 'totp-encryption.key');
  try {
    await writeFile(path, 'truncated');
    await assert.rejects(loadOrCreateTotpEncryptionKey(directory), /密钥文件无效/);
    assert.equal(await readFile(path, 'utf8'), 'truncated');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
