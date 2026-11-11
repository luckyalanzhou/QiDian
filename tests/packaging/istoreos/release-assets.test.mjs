import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { bash } from '../../support/git-bash.mjs';

const managerPath = new URL('../../../packaging/istoreos/luci-app-qidian/root/usr/libexec/istorec/qidian.sh', import.meta.url);

test('Release asset lookup resolves the installer URL when jsonfilter cannot filter asset arrays', async t => {
  const root = await mkdtemp(join(tmpdir(), 'qidian-release-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const workDir = join(root, 'work');
  const binDir = join(root, 'bin');
  const releasePath = join(workDir, 'release.json');
  const jsonFilterPath = join(root, 'jsonfilter.mjs');
  const jsonFilterBin = join(binDir, 'jsonfilter');
  await Promise.all([
    mkdir(workDir, { recursive: true }),
    mkdir(binDir, { recursive: true }),
  ]);

  await writeFile(releasePath, JSON.stringify({
    tag_name: 'v0.0.53',
    assets: [
      {
        name: 'qidian-0.0.53.run',
        label: '栖点-0.0.53.run',
        browser_download_url: 'https://github.com/luckyalanzhou/QiDian/releases/download/v0.0.53/qidian-0.0.53.run'
      },
      {
        name: 'qidian-0.0.53.run.release.sha256',
        label: '栖点-0.0.53.run.sha256',
        browser_download_url: 'https://github.com/luckyalanzhou/QiDian/releases/download/v0.0.53/qidian-0.0.53.run.release.sha256'
      }
    ]
  }));

  await writeFile(jsonFilterPath, `
import { readFileSync } from 'node:fs';
const args = process.argv.slice(2);
let inputFile = null;
let expression = '';
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '-i') inputFile = args[++index];
  else if (args[index] === '-e') expression = args[++index];
}
let input = inputFile ? readFileSync(inputFile, 'utf8') : readFileSync(0, 'utf8');
if (expression.includes('[@.')) process.exit(0);
const value = JSON.parse(input);
if (expression === '@.assets[*]') {
  for (const asset of value.assets ?? []) console.log(JSON.stringify(asset));
} else if (expression.startsWith('@.')) {
  const field = expression.slice(2);
  if (value[field] !== undefined && value[field] !== null) console.log(value[field]);
}
`);
  await writeFile(jsonFilterBin, '#!/bin/sh\nexec node "$QIDIAN_TEST_JSONFILTER" "$@"\n');
  await chmod(jsonFilterBin, 0o755);

  const manager = await readFile(managerPath, 'utf8');
  const functionStart = manager.indexOf('prepare_release_assets() {');
  const functionEnd = manager.indexOf('\n}\n\ncheck_and_apply_updates()', functionStart);
  assert.ok(functionStart >= 0 && functionEnd >= 0, 'manager exposes its Release asset parser and URL resolver');
  const functionSource = manager.slice(functionStart, functionEnd + 2);
  const result = spawnSync(bash, ['-c', `
${functionSource}
UPDATE_WORK_DIR="$QIDIAN_TEST_WORK_DIR"
UPDATE_ASSET_PREFIX='https://github.com/luckyalanzhou/qidian/releases/download/v0.0.53/'
prepare_release_assets || exit 10
printf 'installer=%s\n' "$(release_asset_url 'qidian-0.0.53.run' '栖点-0.0.53.run')"
printf 'checksum=%s\n' "$(release_asset_url 'missing-checksum-name' '栖点-0.0.53.run.sha256')"
`], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      QIDIAN_TEST_JSONFILTER: jsonFilterPath,
      QIDIAN_TEST_WORK_DIR: workDir,
    },
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, `stdout=${result.stdout}; stderr=${result.stderr}`);
  assert.deepEqual(result.stdout.trim().split('\n'), [
    'installer=https://github.com/luckyalanzhou/QiDian/releases/download/v0.0.53/qidian-0.0.53.run',
    'checksum=https://github.com/luckyalanzhou/QiDian/releases/download/v0.0.53/qidian-0.0.53.run.release.sha256'
  ]);
});
