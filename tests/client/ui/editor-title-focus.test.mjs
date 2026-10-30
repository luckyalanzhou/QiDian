import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/../g).map(channel => parseInt(channel, 16) / 255);
  const linear = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first, second) {
  const values = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('note title keyboard focus uses an opaque 2px accent outline in both themes', async () => {
  const [workspaceStyles, themeStyles] = await Promise.all([
    readFile(new URL('../../../src/styles/workspace.css', import.meta.url), 'utf8'),
    readFile(new URL('../../../src/styles.css', import.meta.url), 'utf8')
  ]);
  const focusRule = workspaceStyles.match(/\.title-input:focus-visible\s*\{([^}]+)\}/)?.[1];
  assert.ok(focusRule, 'title input has an explicit keyboard focus rule');
  assert.match(focusRule, /outline:\s*2px solid var\(--accent\)/, 'focus indicator is at least 2px and uses an opaque theme color');
  assert.match(focusRule, /outline-offset:\s*2px/, 'focus outline remains separated from the title text');

  const themes = [
    themeStyles.match(/:root\s*\{([^}]+)\}/)?.[1],
    themeStyles.match(/:root\[data-theme="dark"\]\s*\{([^}]+)\}/)?.[1]
  ];
  for (const theme of themes) {
    assert.ok(theme, 'both theme token sets are defined');
    const accent = theme.match(/--accent:\s*(#[0-9a-f]{6})/i)?.[1];
    const panel = theme.match(/--panel:\s*(#[0-9a-f]{6})/i)?.[1];
    assert.ok(accent && panel, 'focus indicator uses explicit accent and panel tokens');
    assert.ok(contrastRatio(accent, panel) >= 3, `focus contrast is at least 3:1 (${accent} on ${panel})`);
  }
});
