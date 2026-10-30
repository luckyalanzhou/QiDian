import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const tokens = await readFile(new URL('../../../src/styles.css', import.meta.url), 'utf8');
const workspace = await readFile(new URL('../../../src/styles/workspace.css', import.meta.url), 'utf8');

function themeTokens(selector) {
  const block = tokens.match(new RegExp(`${selector}\\s*\\{([^}]+)\\}`))?.[1];
  assert.ok(block, `found theme ${selector}`);
  const read = name => block.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  const values = Object.fromEntries(['--bg', '--panel', '--line', '--sub'].map(name => [name, read(name)]));
  for (const [name, value] of Object.entries(values)) assert.ok(value, `${selector} defines ${name}`);
  return values;
}

function rgb(hex) { return hex.slice(1).match(/../g).map(value => parseInt(value, 16)); }
function luminance(hex) {
  const [r, g, b] = rgb(hex).map(value => value / 255 <= 0.04045 ? value / 12.92 : ((value / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function mix(line, sub, subWeight = 0.7) {
  const a = rgb(line), b = rgb(sub);
  return `#${a.map((value, index) => Math.round(value * (1 - subWeight) + b[index] * subWeight).toString(16).padStart(2, '0')).join('')}`;
}

test('form controls have discernible neutral borders in both themes and retain accent focus', () => {
  assert.match(workspace, /\.form-text,\s*\.form-input,\s*\.form-select\s*\{[^}]*border:\s*1px solid color-mix\(in srgb,\s*var\(--sub\) 70%,\s*var\(--line\)\)/);
  assert.match(workspace, /\.auth-input\s*\{[^}]*border-color:\s*color-mix\(in srgb,\s*var\(--sub\) 70%,\s*var\(--line\)\)/);
  assert.match(workspace, /\.form-text:focus,\s*\.form-input:focus,\s*\.form-select:focus\s*\{[^}]*border-color:\s*var\(--accent\)/);

  for (const selector of [':root', ':root\\[data-theme="dark"\\]']) {
    const values = themeTokens(selector);
    const border = mix(values['--line'], values['--sub']);
    for (const surface of [values['--bg'], values['--panel']]) {
      const ratio = contrast(border, surface);
      assert.ok(ratio >= 3, `${selector} input border contrast ${ratio.toFixed(2)}:1 against ${surface}`);
    }
  }
});
