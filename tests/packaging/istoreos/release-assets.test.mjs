import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { bash } from '../../support/git-bash.mjs';

const managerPath = new URL('../../../packaging/istoreos/luci-app-qidian/root/usr/libexec/istorec/qidian.sh', import.meta.url);
const updaterPath = new URL('../../../packaging/istoreos/luci-app-qidian/root/usr/libexec/istorec/qidian-updater.sh', import.meta.url);

async function sourceFunction(path, name, nextName) {
  const source = await readFile(path, 'utf8');
  const start = source.indexOf(`${name}() {`);
  const end = source.indexOf(`\n}\n\n${nextName}()`, start);
  assert.ok(start >= 0 && end >= 0, `${name} exists in ${path.pathname}`);
  return source.slice(start, end + 2);
}

async function resolveUrls(scriptPath, functionName, nextFunction, prefixVariable) {
  const functionSource = await sourceFunction(scriptPath, functionName, nextFunction);
  const script = `
${functionSource}
${prefixVariable}='https://github.com/luckyalanzhou/qidian/releases/download/v0.0.54/'
printf 'installer=%s\\n' "$(release_asset_url 'qidian-0.0.54.run' '栖点-0.0.54.run')"
printf 'checksum=%s\\n' "$(release_asset_url 'qidian-0.0.54.run.release.sha256' '栖点-0.0.54.run.sha256')"
if release_asset_url '../qidian-0.0.54.run' '栖点-0.0.54.run'; then exit 9; fi
`;
  const result = spawnSync(bash, ['-c', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, `stdout=${result.stdout}; stderr=${result.stderr}`);
  assert.deepEqual(result.stdout.trim().split('\n'), [
    'installer=https://github.com/luckyalanzhou/qidian/releases/download/v0.0.54/qidian-0.0.54.run',
    'checksum=https://github.com/luckyalanzhou/qidian/releases/download/v0.0.54/qidian-0.0.54.run.release.sha256'
  ]);
}

test('LuCI update lookup constructs the known installer and checksum URLs without parsing asset arrays', async () => {
  await resolveUrls(managerPath, 'release_asset_url', 'check_and_apply_updates', 'UPDATE_ASSET_PREFIX');
});

test('background updater lookup constructs the known installer and checksum URLs without parsing asset arrays', async () => {
  await resolveUrls(updaterPath, 'release_asset_url', 'download', 'asset_prefix');
});
