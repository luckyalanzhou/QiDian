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

test('Patch carries at 100 and major/minor carry at 10', () => {
  assert.deepEqual(select({ currentVersion: '0.0.99' }), {
    version: '0.1.0',
    releaseExists: false,
  });
  assert.deepEqual(select({ currentVersion: '0.9.99' }), {
    version: '1.0.0',
    releaseExists: false,
  });
  assert.deepEqual(select({ currentVersion: '9.8.99' }), {
    version: '9.9.0',
    releaseExists: false,
  });
  assert.throws(() => select({ currentVersion: '9.9.99' }), /9\.9\.99 reached/);
});

test('only Patch can use two digits and all components must be canonical', () => {
  for (const currentVersion of ['0.1.100', '0.1.x', '0.01.2', '0.10.1', '10.0.0', '0.1.02', '0.1.2-beta.1']) {
    assert.throws(() => select({ currentVersion }), /major and minor from 0 to 9, and Patch from 0 to 99/);
  }
});
