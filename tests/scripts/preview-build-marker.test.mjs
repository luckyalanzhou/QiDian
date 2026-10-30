import assert from 'node:assert/strict';
import test from 'node:test';
import { appendPreviewBuildMarker } from '../../scripts/preview-build-marker.mjs';

test('local preview marks the service worker with the current production build', () => {
  const source = Buffer.from("const CACHE_NAME = 'qidian-pwa-shell-0.0.44';");
  const firstBuild = appendPreviewBuildMarker(source, '0123456789abcdef');
  const nextBuild = appendPreviewBuildMarker(source, 'fedcba9876543210');

  assert.equal(firstBuild.toString(), `${source.toString()}\n// local-preview-build:0123456789abcdef\n`);
  assert.notEqual(firstBuild.toString(), nextBuild.toString());
  assert.equal(firstBuild.toString().includes("qidian-pwa-shell-0.0.44"), true);
});

test('local preview rejects unsafe service worker markers', () => {
  assert.throws(() => appendPreviewBuildMarker('self.skipWaiting()', '../current'), /Invalid local preview build marker/);
});
