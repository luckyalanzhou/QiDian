import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_ASSETS = (version) => [
  `栖点-${version}.run`,
  `栖点-${version}.run.sha256`,
];

function parseVersion(version) {
  const match = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.exec(version ?? '');
  if (!match) throw new Error(`Expected canonical Major.Minor.Patch integers without leading zeros, got ${version}`);
  return match;
}

function incrementVersion(version, bumpType) {
  const [, major, minor, patch] = parseVersion(version);
  let nextMajor = BigInt(major);
  let nextMinor = BigInt(minor);
  let nextPatch = BigInt(patch);

  if (bumpType === 'major') {
    nextMajor += 1n;
    nextMinor = 0n;
    nextPatch = 0n;
  } else if (bumpType === 'minor') {
    nextMinor += 1n;
    nextPatch = 0n;
  } else if (bumpType === 'patch') {
    nextPatch += 1n;
  } else {
    throw new Error(`Unknown release bump type: ${bumpType}`);
  }

  return `${nextMajor}.${nextMinor}.${nextPatch}`;
}

function isCompleteRelease(release, version) {
  if (!release || release.isDraft) return false;
  const assetNames = new Set((release.assets ?? []).flatMap(({ name, label }) => [name, label].filter(Boolean)));
  return REQUIRED_ASSETS(version).every((name) => assetNames.has(name));
}

export function resolveReleaseVersion({ currentVersion, lastPackageCommit, getRelease, bumpType = 'patch', isWorkflowRetry = false }) {
  parseVersion(currentVersion);
  if (!['patch', 'minor', 'major'].includes(bumpType)) {
    throw new Error(`Unknown release bump type: ${bumpType}`);
  }
  const currentRelease = getRelease(`v${currentVersion}`);

  // A rerun after publishing the release only needs to repair the `latest` image
  // alias. Rebuilding or selecting a new version here could publish unrelated code.
  if (isWorkflowRetry && currentRelease && isCompleteRelease(currentRelease, currentVersion)) {
    return { version: currentVersion, releaseExists: true, promoteOnly: true };
  }

  // A draft or incomplete release is an unfinished attempt. Keep its version so
  // a rerun can replace partial assets and publish the same tag.
  if (currentRelease && !isCompleteRelease(currentRelease, currentVersion)) {
    return { version: currentVersion, releaseExists: true };
  }

  // The version bump is committed immediately before release creation. If that
  // commit exists but no release does, this is a retry of the pending version.
  if (!currentRelease && lastPackageCommit === `chore: release v${currentVersion}`) {
    return { version: currentVersion, releaseExists: false };
  }

  // A normal manual run applies the selected SemVer bump. Skip any already
  // complete version and resume the first draft or incomplete release found.
  let version = incrementVersion(currentVersion, bumpType);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const release = getRelease(`v${version}`);
    if (!release) return { version, releaseExists: false };
    if (!isCompleteRelease(release, version)) return { version, releaseExists: true };
    version = incrementVersion(version, bumpType);
  }

  throw new Error('Unable to select a free release version after 100 attempts');
}

function run(command, args) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
}

function main() {
  const bumpType = process.argv[2] || process.env.RELEASE_BUMP || 'patch';
  const manifestPath = 'package.json';
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const releases = JSON.parse(run('gh', [
    'release', 'list', '--limit', '100', '--json', 'tagName,isDraft',
  ]));
  const releaseTags = new Set(releases.map((release) => release.tagName));
  const releaseCache = new Map();
  const getRelease = (tag) => {
    if (!releaseTags.has(tag)) return null;
    if (!releaseCache.has(tag)) {
      releaseCache.set(tag, JSON.parse(run('gh', [
        'release', 'view', tag, '--json', 'isDraft,assets',
      ])));
    }
    return releaseCache.get(tag);
  };
  const lastPackageCommit = run('git', [
    'log', '-1', '--format=%s', '--', 'package.json',
  ]);
  const selection = resolveReleaseVersion({
    currentVersion: manifest.version,
    lastPackageCommit,
    getRelease,
    bumpType,
    isWorkflowRetry: Number(process.env.WORKFLOW_RUN_ATTEMPT) > 1,
  });

  if (selection.version !== manifest.version) {
    manifest.version = selection.version;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, [
      `version=${selection.version}`,
      `release_exists=${selection.releaseExists}`,
      `promote_only=${selection.promoteOnly === true}`,
      '',
    ].join('\n'));
  }
  process.stdout.write(selection.version);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
