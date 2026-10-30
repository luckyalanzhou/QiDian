import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('command palette keeps a visible theme-colored focus indicator around its search row', async () => {
  const styles = await readFile(new URL('../../../src/styles.css', import.meta.url), 'utf8');
  const focusRule = styles.match(/\.command-palette-search:focus-within\s*\{([^}]+)\}/)?.[1];
  assert.ok(focusRule, 'focused search row has a dedicated focus style');
  assert.match(focusRule, /outline:\s*2px solid var\(--accent\)/);
  assert.match(focusRule, /outline-offset:\s*-2px/);
});

test('mobile command palette shortcut hints keep the 11px secondary-text baseline', async () => {
  const styles = await readFile(new URL('../../../src/styles.css', import.meta.url), 'utf8');
  const footerFontSize = styles.match(/\.command-palette-footer\{justify-content:space-between;gap:5px;padding:9px 11px;font-size:(\d+)px\}/)?.[1];
  assert.equal(footerFontSize, '11');
  assert.match(styles, /\.command-palette-footer span\{white-space:nowrap;flex-shrink:0\}/);
});

test('command palette announces when a query has no matching actions', async () => {
  const component = await readFile(new URL('../../../src/features/command-palette/CommandPalette.vue', import.meta.url), 'utf8');
  assert.match(component, /<p v-if="!filteredCommands\.length"[^>]*role="status"[^>]*aria-live="polite"[^>]*>没有匹配的操作<\/p>/);
});
