import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveReleaseVersion } from '../scripts/release-version.mjs';

const completeRelease = (version) => ({
  isDraft: false,
  assets: [
    { name: `栖点-${version}.run` },
    { name: `栖点-${version}.run.sha256` },
  ],
});

const select = ({ currentVersion = '0.0.0', lastPackageCommit = 'feat: change', releases = {} } = {}) =>
  resolveReleaseVersion({
    currentVersion,
    lastPackageCommit,
    getRelease: (tag) => releases[tag] ?? null,
  });

test('a manual release with no matching release advances Patch', () => {
  assert.deepEqual(select(), { version: '0.0.1', releaseExists: false });
});

test('a committed version without a release resumes that version', () => {
  assert.deepEqual(select({
    lastPackageCommit: 'chore: release v0.0.1',
    currentVersion: '0.0.1',
  }), { version: '0.0.1', releaseExists: false });
});

test('a draft release with partial assets resumes the same version', () => {
  assert.deepEqual(select({
    currentVersion: '0.0.1',
    releases: { 'v0.0.1': { isDraft: true, assets: [{ name: '栖点-0.0.1.run' }] } },
  }), { version: '0.0.1', releaseExists: true });
});

test('a published release missing its checksum resumes for repair', () => {
  assert.deepEqual(select({
    currentVersion: '0.0.1',
    releases: { 'v0.0.1': { isDraft: false, assets: [{ name: '栖点-0.0.1.run' }] } },
  }), { version: '0.0.1', releaseExists: true });
});

test('a complete release causes the next manual build to advance Patch', () => {
  assert.deepEqual(select({
    currentVersion: '0.0.1',
    releases: { 'v0.0.1': completeRelease('0.0.1') },
  }), { version: '0.0.2', releaseExists: false });
});

test('an already complete candidate is skipped', () => {
  assert.deepEqual(select({
    currentVersion: '0.0.0',
    releases: { 'v0.0.1': completeRelease('0.0.1') },
  }), { version: '0.0.2', releaseExists: false });
});

test('a draft candidate is resumed rather than skipped', () => {
  assert.deepEqual(select({
    currentVersion: '0.0.0',
    releases: { 'v0.0.1': { isDraft: true, assets: [] } },
  }), { version: '0.0.1', releaseExists: true });
});

test('version components carry at 10 and stay within one digit', () => {
  assert.deepEqual(select({ currentVersion: '0.0.9' }), {
    version: '0.1.0',
    releaseExists: false,
  });
  assert.deepEqual(select({ currentVersion: '0.9.9' }), {
    version: '1.0.0',
    releaseExists: false,
  });
  assert.throws(() => select({ currentVersion: '9.9.9' }), /9\.9\.9 reached/);
});

test('release versions must use exactly three single-digit numeric components', () => {
  for (const currentVersion of ['0.1.27', '0.1.x', '0.01.2', '0.1.2-beta.1']) {
    assert.throws(() => select({ currentVersion }), /one digit per component/);
  }
});
