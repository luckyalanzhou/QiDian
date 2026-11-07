import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { bash } from '../../support/git-bash.mjs';

const source = (await readFile(new URL('../../../packaging/istoreos/install.sh', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');

async function install(t, { existing = false, worker = false, failsLuciCopy = false, locked = false, initialResult = 'success' } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'qidian-install-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dirs = ['payload/root/usr/libexec/istorec', 'payload/root/etc/init.d', 'payload/root/etc/config',
    'payload/root/usr/lib/lua/luci/view/qidian', 'usr/lib/lua/luci/controller', 'usr/lib/lua/luci/model/cbi',
    'usr/lib/lua/luci/view/qidian', 'etc/config', 'etc/init.d', 'opt/qidian', 'tmp'];
  for (const dir of dirs) await mkdir(join(root, dir), { recursive: true });
  const marker = 'EXISTING USER CONFIGURATION\n';
  await writeFile(join(root, 'payload/compose.yaml'), 'services: {}\n');
  await writeFile(join(root, 'payload/.env.example'), 'APP_BIND_ADDRESS=0.0.0.0\n');
  await writeFile(join(root, 'payload/version'), '0.0.20\n');
  await writeFile(join(root, 'payload/root/etc/config/qidian'), 'config qidian main\n');
  await writeFile(join(root, 'payload/root/usr/lib/lua/luci/view/qidian/status.htm'), 'current page\n');
  await writeFile(join(root, 'payload/root/usr/lib/lua/luci/view/qidian/custom-v0.0.20.htm'), 'current versioned page\n');
  await writeFile(join(root, 'payload/root/usr/libexec/istorec/qidian-updater.sh'), '#!/bin/sh\nexit 0\n');
  await writeFile(join(root, 'payload/root/usr/libexec/istorec/qidian.sh'), `#!/bin/sh
printf '%s\\n' "$*" >> "$QIDIAN_TEST_ROOT/manager.log"
`);
  await writeFile(join(root, 'payload/root/etc/init.d/qidian-updater'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$QIDIAN_TEST_ROOT/agent.log"\n');
  if (existing) {
    await writeFile(join(root, 'etc/config/qidian'), marker);
    await writeFile(join(root, 'opt/qidian/.env'), marker);
    await mkdir(join(root, 'data'));
    await writeFile(join(root, 'data/user.sqlite'), marker);
  }
  if (locked) await mkdir(join(root, 'tmp/qidian-operation.lock'));
  await writeFile(join(root, 'tmp/qidian-operation.result'), `${initialResult}\n`);
  await writeFile(join(root, 'usr/lib/lua/luci/view/qidian/status-v0.0.19.htm'), 'stale versioned page\n');
  await writeFile(join(root, 'usr/lib/lua/luci/view/qidian/logs_0.0.18.htm'), 'stale versioned page\n');
  await writeFile(join(root, 'usr/lib/lua/luci/view/qidian/custom.htm'), 'unversioned local page\n');
  const pathResult = spawnSync(bash, ['-c', 'if command -v cygpath >/dev/null 2>&1; then cygpath -u "$QIDIAN_TEST_ROOT"; else printf "%s" "$QIDIAN_TEST_ROOT"; fi'], {
    env: { ...process.env, QIDIAN_TEST_ROOT: root }, encoding: 'utf8'
  });
  assert.equal(pathResult.status, 0, pathResult.stderr);
  const shellRoot = pathResult.stdout.trim();
  // Redirect absolute device paths into this test's isolated temporary device.
  const staged = source.replace(/(?<![A-Za-z0-9_.])\/(opt\/qidian|usr|etc|tmp)(?=[/"})\s;]|$)/g, (_, p) => `${shellRoot}/${p}`);
  await writeFile(join(root, 'payload/install.sh'), staged);
  const result = spawnSync(bash, ['-s'], {
    input: `id() { printf '0\\n'; }
jsonfilter() { :; }
cp() { for arg do case "$arg" in */payload/root/usr/.) [ "\${MOCK_FAIL_LUCI_COPY:-0}" != 1 ] || return 73 ;; esac; done; command cp "$@"; }
uci() { case "$*" in '-q get qidian.main.registration_enabled') printf '0\\n' ;; *) : ;; esac; }
export -f id jsonfilter uci cp
export QIDIAN_TEST_ROOT='${shellRoot}'
export QIDIAN_UPDATE_WORKER=${worker ? '1' : '0'}
export MOCK_FAIL_LUCI_COPY=${failsLuciCopy ? '1' : '0'}
bash '${shellRoot}/payload/install.sh'
`,
    env: { ...process.env, QIDIAN_TEST_ROOT: root }, encoding: 'utf8', timeout: 15000
  });
  assert.ifError(result.error);
  if (existing) {
    assert.equal(await readFile(join(root, 'etc/config/qidian'), 'utf8'), marker);
    assert.equal(await readFile(join(root, 'opt/qidian/.env'), 'utf8'), marker);
    assert.equal(await readFile(join(root, 'data/user.sqlite'), 'utf8'), marker);
  }
  if (result.status === 0) {
    await access(join(root, 'usr/lib/lua/luci/view/qidian/status.htm'));
    await access(join(root, 'usr/lib/lua/luci/view/qidian/custom.htm'));
    await access(join(root, 'usr/lib/lua/luci/view/qidian/custom-v0.0.20.htm'));
    await assert.rejects(access(join(root, 'usr/lib/lua/luci/view/qidian/status-v0.0.19.htm')));
    await assert.rejects(access(join(root, 'usr/lib/lua/luci/view/qidian/logs_0.0.18.htm')));
  }
  return { root, result };
}

test('manual run installation installs LuCI without deploying and releases its operation lock', async t => {
  const { root, result } = await install(t);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await readFile(join(root, 'manager.log'), 'utf8')).trim().split('\n'), ['prepare-control']);
  assert.match(result.stdout, /管理插件已安装/);
  assert.doesNotMatch(result.stdout, /DEPLOY LOG/);
  assert.equal((await readFile(join(root, 'tmp/qidian-operation.result'), 'utf8')).trim(), 'success');
  await assert.rejects(access(join(root, 'tmp/qidian-operation.lock')));
});

test('manual run upgrade preserves existing user configuration and data', async t => {
  const { root, result } = await install(t, { existing: true });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await readFile(join(root, 'manager.log'), 'utf8')).trim().split('\n'), ['prepare-control']);
});

test('online run installation leaves deployment to its existing worker', async t => {
  const { root, result } = await install(t, { existing: true, worker: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal((await readFile(join(root, 'manager.log'), 'utf8')).trim(), 'prepare-control');
  assert.equal((await readFile(join(root, 'agent.log'), 'utf8')).trim(), 'enable');
});

test('manual install clears a stale deployment failure without starting the container', async t => {
  const { root, result } = await install(t, { existing: true, initialResult: 'failed' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await readFile(join(root, 'manager.log'), 'utf8')).trim().split('\n'), ['prepare-control']);
  assert.equal((await readFile(join(root, 'tmp/qidian-operation.result'), 'utf8')).trim(), 'success');
  assert.doesNotMatch(result.stdout, /DEPLOY LOG/);
  await access(join(root, 'usr/libexec/istorec/qidian.sh'));
  await assert.rejects(access(join(root, 'tmp/qidian-operation.lock')));
});

test('manual installer refuses an active operation without removing its lock', async t => {
  const { root, result } = await install(t, { existing: true, locked: true });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /另一项操作正在执行/);
  await access(join(root, 'tmp/qidian-operation.lock'));
  await assert.rejects(access(join(root, 'manager.log')));
});

test('a failed LuCI file copy keeps the previous versioned pages available', async t => {
  const { root, result } = await install(t, { existing: true, failsLuciCopy: true });
  assert.notEqual(result.status, 0);
  await access(join(root, 'usr/lib/lua/luci/view/qidian/status-v0.0.19.htm'));
  await access(join(root, 'usr/lib/lua/luci/view/qidian/logs_0.0.18.htm'));
});
