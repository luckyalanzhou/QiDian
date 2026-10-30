import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const sourceRoot = fileURLToPath(new URL('../../../src/', import.meta.url));
const sourceExtensions = new Set(['.js', '.mjs', '.ts', '.vue']);

async function collectSources(directory) {
  const files = [];

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectSources(path));
    else if (sourceExtensions.has(extname(entry.name))) files.push(path);
  }

  return files;
}

function findNativeDialogCalls(source) {
  const declarationsRemoved = source.replace(
    /\bfunction\s+(?:confirm|alert|prompt)\s*\(/g,
    'function customDialogHandler(',
  );
  const patterns = [
    /\b(?:window|globalThis|self|document\.defaultView)\s*(?:\?\.|\.)\s*(?:confirm|alert|prompt)\s*(?:\?\.)?\s*\(/g,
    /\b(?:window|globalThis|self)\s*\[\s*(['"])(?:confirm|alert|prompt)\1\s*\]\s*\(/g,
    /(?<![\w.$])(?:confirm|alert|prompt)\s*\(/g,
  ];

  return patterns.flatMap((pattern) => [...declarationsRemoved.matchAll(pattern)]);
}

test('custom dialog handlers are allowed while browser-native dialogs are detected', () => {
  assert.equal(findNativeDialogCalls('function confirm() {}').length, 0);
  assert.equal(findNativeDialogCalls('await dependencies.confirm(message)').length, 0);
  assert.equal(findNativeDialogCalls('openActionDialog({ mode: "confirm" })').length, 0);
  assert.equal(findNativeDialogCalls('window.confirm(message)').length, 1);
  assert.equal(findNativeDialogCalls('if (confirm(message)) {}').length, 1);
  assert.equal(findNativeDialogCalls('globalThis["alert"](message)').length, 1);
});

test('application source does not call browser-native confirm, alert, or prompt', async () => {
  const files = await collectSources(sourceRoot);
  const violations = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const matches = findNativeDialogCalls(source);
    for (const match of matches) {
      const line = source.slice(0, match.index).split('\n').length;
      violations.push(`${file}:${line}`);
    }
  }

  assert.deepEqual(violations, [], 'Use the in-app ActionDialog instead of browser-native dialogs');
});
