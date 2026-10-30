import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strFromU8, unzipSync } from 'fflate';
import { packageExtension } from '../../scripts/package-extension.mjs';

test('Chrome extension package contains only the MV3 popup and uses the app release version', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'qidian-extension-'));
  t.after(() => rm(directory, { recursive:true, force:true }));
  const archivePath = await packageExtension({ version:'2.3.4', outputDirectory:directory });
  const archive = unzipSync(new Uint8Array(await readFile(archivePath)));
  assert.deepEqual(Object.keys(archive).sort(), ['manifest.json', 'popup.html', 'popup.js']);
  const manifest = JSON.parse(strFromU8(archive['manifest.json']));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.version, '2.3.4');
  assert.deepEqual(manifest.permissions, ['activeTab', 'storage']);
  assert.deepEqual(manifest.optional_host_permissions, ['http://*/*', 'https://*/*']);
  const popup = strFromU8(archive['popup.html']);
  assert.match(popup, /<script src="popup\.js"><\/script>/);
  assert.deepEqual(popup.match(/<script\b[^>]*>/gi), ['<script src="popup.js">']);
  assert.doesNotMatch(strFromU8(archive['popup.js']), /document\.write|innerHTML|eval\(/);
});

test('Chrome extension packaging rejects unsupported version components', async () => {
  await assert.rejects(packageExtension({ version:'1.65536.0', outputDirectory:tmpdir() }), /不超过 65535/);
});
