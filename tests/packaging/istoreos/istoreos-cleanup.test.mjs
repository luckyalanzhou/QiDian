import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const source = await readFile(new URL('../../../packaging/istoreos/luci-app-qidian/root/usr/libexec/istorec/qidian.sh', import.meta.url), 'utf8');
const functions = source.slice(0, source.lastIndexOf('\ncase "${1:-status}" in')).replaceAll('\r\n', '\n');
const oldImage = `sha256:${'a'.repeat(64)}`;
const newImage = `sha256:${'b'.repeat(64)}`;
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const mock = `
OLD_IMAGE=${oldImage}
NEW_IMAGE=${newImage}
docker() {
  case "$1 $2" in
    'inspect --type')
      case "$*" in
        *State.Health*) printf 'running %s %s\\n' "\${HEALTH:-healthy}" "\${CONTAINER_IMAGE:-$NEW_IMAGE}" ;;
        *State.Status*) printf '%s\\n' "\${PREVIOUS_STATE-running}" ;;
        *) if [ "\${RECREATED:-0}" = 1 ]; then printf '%s\\n' "$NEW_IMAGE"; else printf '%s\\n' "$OLD_IMAGE"; fi ;;
      esac ;;
    'image inspect')
      [ "\${INSPECT_ERROR:-0}" != 1 ] || return 1
      case "$*" in
        *RepoDigests*)
          [ "\${DANGLING:-0}" != 1 ] || return 0
          printf 'luckyalanzhou/qidian:0.0.17\\nluckyalanzhou/qidian@sha256:abc\\n'
          [ "\${FOREIGN_TAG:-0}" != 1 ] || printf 'other/app:latest\\n'
          return 0 ;;
        *RepoTags*) printf 'luckyalanzhou/qidian:0.0.17\\n' ;;
        *'{{.Id}}'*)
          case "$*" in
            *qidian:latest*) if [ "\${PULLED:-0}" = 1 ]; then printf '%s\\n' "$NEW_IMAGE"; else printf '%s\\n' "$OLD_IMAGE"; fi ;;
            *) printf '%s\\n' "$OLD_IMAGE" ;;
          esac ;;
        *) return 0 ;;
      esac ;;
    'container ls')
      [ "$3" = -aq ] && [ "$4" = --filter ] && [ "$5" = "ancestor=$OLD_IMAGE" ] || return 99
      [ "\${LIST_ERROR:-0}" != 1 ] || return 1
      [ "\${IN_USE:-0}" != 1 ] || printf 'stopped-other-container\\n'
      return 0 ;;
    'image rm')
      [ "$3" = --no-prune ] || return 99
      printf 'REMOVE %s\\n' "$4"
      [ "\${REMOVE_ERROR:-0}" != 1 ] ;;
    *) printf 'UNEXPECTED DOCKER: %s\\n' "$*" >&2; return 99 ;;
  esac
}
sleep() { :; }
remember_replaced_images docker.io/luckyalanzhou/qidian:latest
`;

function run(scenario, before = '') {
  const result = spawnSync(bash, ['-s'], {
    input: `${functions}\n${before}\n${mock}\n${scenario}\n`,
    encoding: 'utf8', timeout: 15000
  });
  assert.ifError(result.error);
  assert.doesNotMatch(result.stderr, /UNEXPECTED DOCKER/);
  return result;
}

test('successful replacement cleans only the captured Qidian image and its tags once', () => {
  const result = run('PULLED=1; wait_for_ready_image "$NEW_IMAGE"; cleanup_replaced_images "$NEW_IMAGE"');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.match(/^REMOVE .+$/gm), [
    'REMOVE luckyalanzhou/qidian:0.0.17', `REMOVE ${oldImage}`
  ]);
});

for (const [name, setup] of [
  ['same image', 'NEW_IMAGE=$OLD_IMAGE'],
  ['container still references old image, including stopped containers', 'IN_USE=1'],
  ['image has gained another application tag', 'FOREIGN_TAG=1'],
  ['image inspection fails', 'INSPECT_ERROR=1'],
  ['container listing fails', 'LIST_ERROR=1'],
  ['new image identifier is unavailable', 'NEW_IMAGE='],
]) {
  test(`cleanup preserves resources when ${name}`, () => {
    const result = run(`${setup}; cleanup_replaced_images "$NEW_IMAGE"`);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /^REMOVE /m);
  });
}

test('images of unknown or mixed ownership are never captured for cleanup', () => {
  for (const before of ['FOREIGN_TAG=1', 'DANGLING=1']) {
    const result = run('cleanup_replaced_images "$NEW_IMAGE"', before);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /^REMOVE /m);
  }
});

test('an image made dangling by a mutable tag pull is cleaned after ownership was captured', () => {
  const result = run('DANGLING=1; cleanup_replaced_images "$NEW_IMAGE"');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`^REMOVE ${oldImage}$`, 'm'));
});

test('retagging the previous tag to the new image never removes that tag', () => {
  const result = run(`
docker_original=$(declare -f docker | sed '1s/docker/docker_original/')
eval "$docker_original"
docker() {
  case "$*" in *'{{.Id}}'*qidian:0.0.17*) printf '%s\\n' "$NEW_IMAGE" ;; *) docker_original "$@" ;; esac
}
cleanup_replaced_images "$NEW_IMAGE"
`);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /REMOVE luckyalanzhou/);
});

test('cleanup errors do not fail a completed deployment', () => {
  const result = run('REMOVE_ERROR=1; cleanup_replaced_images "$NEW_IMAGE"');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /未能清理，已保留/);
});

test('an unhealthy or mismatched new container cannot trigger image cleanup', () => {
  for (const setup of ['HEALTH=unhealthy', 'HEALTH=starting', 'CONTAINER_IMAGE=$OLD_IMAGE']) {
    const result = run(`${setup}; if wait_for_ready_image "$NEW_IMAGE"; then cleanup_replaced_images "$NEW_IMAGE"; fi`);
    assert.doesNotMatch(result.stdout, /^REMOVE /m);
    assert.match(result.stderr, /未通过健康检查，保留旧镜像/);
  }
});

test('manager never prunes Docker resources or removes volumes, networks, or containers during cleanup', () => {
  assert.doesNotMatch(source, /docker (?:system|image|volume|container|network|builder) prune|docker (?:volume|network|container) rm|docker image rm [^\n]*(?:--force| -f\b)/);
  assert.doesNotMatch(source, /compose down[^\n]*(?:--volumes| -v\b)/);
});

test('installation cleans after pull, recreation and health verification, and never after either failure', () => {
  const install = source.slice(source.indexOf('\n\t\tinstall|upgrade|install-package)') + '\n\t\tinstall|upgrade|install-package)'.length,
    source.indexOf('\n\t\t\tif [ "${QIDIAN_UPDATE_WORKER:-0}" != 1 ]')).replaceAll('\r\n', '\n');
  assert.match(install, /docker pull/);
  for (const [failure, expectedStatus, cleans] of [['', 0, true], ['PREVIOUS_STATE=', 0, true], ['PREVIOUS_STATE=exited', 0, false], ['PULL_ERROR=1', 10, false], ['COMPOSE_ERROR=1', 1, false], ['HEALTH=unhealthy', 1, false]]) {
    const result = run(`
${failure}
docker_original=$(declare -f docker | sed '1s/docker/docker_original/')
eval "$docker_original"
docker() {
  if [ "$1" = pull ]; then
    [ "$2" = --quiet ] || { printf 'PULL_VERBOSE\\n'; return 99; }
    printf 'PULL %s\\n' "$3"
    [ "\${PULL_ERROR:-0}" != 1 ] || return 10
    PULLED=1
  else docker_original "$@"; fi
}
prepare() { :; }
set_env() { :; }
uci() { printf '9908\\n'; }
compose() { printf 'RECREATE %s\\n' "$*"; [ "\${COMPOSE_ERROR:-0}" != 1 ] || return 11; RECREATED=1; }
INSTALL_DIR=.
action=install
${install}
`);
    assert.equal(result.status, expectedStatus, result.stderr);
    if (!cleans) assert.doesNotMatch(result.stdout, /^REMOVE /m);
    else {
      assert.match(result.stdout, /^REMOVE /m);
      assert.ok(result.stdout.indexOf('PULL') < result.stdout.indexOf('RECREATE'));
      assert.ok(result.stdout.indexOf('RECREATE') < result.stdout.indexOf('REMOVE'));
    }
    if (failure === 'PREVIOUS_STATE=exited') {
      assert.match(result.stdout, /RECREATE create --force-recreate qidian/);
      assert.doesNotMatch(result.stdout, /RECREATE up/);
    }
  }
});

test('Save and Apply keeps the current image and stopped state without pulling or cleaning images', () => {
  const apply = source.slice(source.indexOf('\n\t\tapply-config)') + '\n\t\tapply-config)'.length,
    source.indexOf('\n\t\tinstall|upgrade|install-package)')).replace(/\n\t\t\t;;\s*$/, '').replaceAll('\r\n', '\n');
  for (const state of ['running', 'exited']) {
    const result = run(`
PREVIOUS_STATE=${state}
NEW_IMAGE=$OLD_IMAGE
docker_original=$(declare -f docker | sed '1s/docker/docker_original/')
eval "$docker_original"
docker() { if [ "$1" = info ]; then return 0; else docker_original "$@"; fi; }
prepare() { :; }
set_env() { printf 'ENV %s=%s\\n' "$1" "$2"; }
compose() { printf 'COMPOSE %s\\n' "$*"; RECREATED=1; }
INSTALL_DIR=.
${apply}
`);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`ENV QIDIAN_IMAGE=${oldImage}`));
    assert.match(result.stdout, state === 'exited' ? /COMPOSE create --force-recreate qidian/ : /COMPOSE up -d --no-build --force-recreate qidian/);
    assert.doesNotMatch(result.stdout, /REMOVE|PULL/);
  }
});

test('stored image configuration preserves version pins and rejects unrelated images', () => {
  for (const value of ['docker.io/luckyalanzhou/qidian:0.0.19', 'luckyalanzhou/qidian:latest', oldImage, 'other/app:latest']) {
    const result = run(`
SAVED_IMAGE='${value}'
ENV_FILE=/unused-test-file
sed() { printf '%s\\n' "$SAVED_IMAGE"; }
configured_image
`);
    assert.equal(result.status, value === 'other/app:latest' ? 1 : 0, result.stderr);
    if (!result.status) assert.equal(result.stdout.trim(), value);
  }
});

test('online image updates pull latest and reject an unsynchronized image before replacing a container', () => {
  const install = source.slice(source.indexOf('\n\t\tinstall|upgrade|install-package)') + '\n\t\tinstall|upgrade|install-package)'.length,
    source.indexOf('\n\t\t\tif [ "${QIDIAN_UPDATE_WORKER:-0}" != 1 ]'))
    .replaceAll('\r\n', '\n').replace('exec >> "$status_dir/update.log" 2>&1', ':');
  for (const version of ['0.0.20', '0.0.19', 'unknown']) {
    const result = run(`
QIDIAN_UPDATE_WORKER=1
QIDIAN_TARGET_VERSION=0.0.20
PULLED_VERSION=${version}
docker_original=$(declare -f docker | sed '1s/docker/docker_original/')
eval "$docker_original"
docker() {
  case "$*" in
    'pull --quiet '*) printf 'PULL %s\\n' "$3"; PULLED=1 ;;
    'image inspect '*Config.Env*) printf 'QIDIAN_VERSION=%s\\n' "$PULLED_VERSION" ;;
    *) docker_original "$@" ;;
  esac
}
prepare() { :; }
set_env() { printf 'ENV %s=%s\\n' "$1" "$2"; }
uci() { printf '9908\\n'; }
compose() { printf 'RECREATE %s\\n' "$*"; RECREATED=1; }
INSTALL_DIR=.
action=install
${install}
`);
    assert.equal(result.status, version === '0.0.20' ? 0 : 1, result.stderr);
    assert.match(result.stdout, /PULL docker.io\/luckyalanzhou\/qidian:latest/);
    if (version === '0.0.20') assert.match(result.stdout, /RECREATE up/);
    else {
      assert.doesNotMatch(result.stdout, /RECREATE|REMOVE|ENV QIDIAN_IMAGE=/);
      assert.match(result.stderr, /版本.*不一致/);
    }
  }
});
