import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { revealAuthenticationGate } from '../../../src/features/auth/reveal-authentication-gate.ts';

test('the initial shell shows a neutral startup screen instead of a premature login form', async () => {
  const html = await readFile(new URL('../../../index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../../../src/styles.css', import.meta.url), 'utf8');
  const { document } = new JSDOM(html).window;

  assert.equal(document.body.classList.contains('booting'), true);
  assert.equal(document.querySelector('#appBoot')?.getAttribute('role'), 'status');
  assert.equal(document.querySelector('#appBoot')?.textContent.trim(), '栖正在打开栖点…');
  assert.equal(document.querySelector('#loginGate')?.hidden, true);
  assert.equal(document.querySelector('.app')?.hidden, true);
  assert.match(css, /body\.booting\s*>\s*:not\(#appBoot\)\s*\{\s*display:none!important\s*\}/);
  assert.match(css, /body\.booting\s*>\s*#appBoot\s*\{[^}]*display:grid/);
});

test('authentication reveal ends booting before showing login or startup errors', () => {
  const { document } = new JSDOM('<body class="booting"><section id="loginGate" hidden></section></body>').window;
  const gate = document.querySelector('#loginGate');

  revealAuthenticationGate(document, gate);

  assert.equal(document.body.classList.contains('booting'), false);
  assert.equal(gate.hidden, false);
});
