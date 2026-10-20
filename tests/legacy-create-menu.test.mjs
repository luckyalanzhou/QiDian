import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createLegacyCreateMenu } from '../src/features/create-menu/legacy-create-menu.ts';

test('legacy create menu creates accessible choices once and focuses the first option', () => {
  const dom = new JSDOM('<body></body>');
  const { document } = dom.window;
  const menu = createLegacyCreateMenu({ document, icons: name => `<i data-icon="${name}"></i>` });

  menu.open();
  const dialog = document.querySelector('#createOverlay [role="dialog"]');
  assert.equal(dialog.getAttribute('aria-labelledby'), 'createTitle');
  assert.deepEqual([...dialog.querySelectorAll('[data-create-kind]')].map(button => button.dataset.createKind), ['note', 'bookmark', 'capture']);
  assert.equal(document.activeElement, dialog.querySelector('[data-create-kind="note"]'));

  menu.close();
  assert.equal(document.querySelector('#createOverlay').classList.contains('open'), false);
  menu.open();
  assert.equal(document.querySelectorAll('#createOverlay').length, 1);
  assert.equal(document.querySelector('#createOverlay').classList.contains('open'), true);

  dom.window.close();
});
