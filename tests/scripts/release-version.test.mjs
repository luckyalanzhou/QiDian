import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveReleaseVersion } from '../../scripts/release-version.mjs';

const completeRelease = (version) => ({
  isDraft: false,
  assets: [
    { name: `栖点-${version}.run` },
    { name: `栖点-${version}.run.sha256` },
  ],
});

const select = ({ currentVersion = '0.0.0', lastPackageCommit = 'feat: change', releases = {}, bumpType = 'patch' } = {}) =>
  resolveReleaseVersion({
    currentVersion,
    lastPackageCommit,
    getRelease: (tag) => releases[tag] ?? null,
    bumpType,
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

test('GitHub release asset labels count when the uploaded file names are internal', () => {
  const assets = [
    { name: 'qidian-0.0.1.run', label: '栖点-0.0.1.run' },
    { name: 'qidian-0.0.1.run.release.sha256', label: '栖点-0.0.1.run.sha256' },
  ];
  assert.deepEqual(select({
    currentVersion: '0.0.1',
    releases: { 'v0.0.1': { isDraft: false, assets } },
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

test('Patch increases without an artificial limit', () => {
  assert.deepEqual(select({ currentVersion: '0.0.99' }), {
    version: '0.0.100',
    releaseExists: false,
  });
  assert.deepEqual(select({ currentVersion: '9.9.99999999999999999999' }), {
    version: '9.9.100000000000000000000',
    releaseExists: false,
  });
});

test('manual Minor and Major bumps reset the lower components', () => {
  assert.deepEqual(select({ currentVersion: '0.9.99', bumpType: 'minor' }), {
    version: '0.10.0',
    releaseExists: false,
  });
  assert.deepEqual(select({ currentVersion: '9.99.999', bumpType: 'major' }), {
    version: '10.0.0',
    releaseExists: false,
  });
});

test('release versions use canonical non-negative integers without leading zeros', () => {
  for (const currentVersion of ['0.1.x', '01.0.1', '0.01.2', '0.1.02', '0.1.2-beta.1']) {
    assert.throws(() => select({ currentVersion }), /canonical Major.Minor.Patch integers/);
  }
});

test('release bump type must be patch, minor or major', () => {
  assert.throws(() => select({ bumpType: 'build' }), /Unknown release bump type/);
});
