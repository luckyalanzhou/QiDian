import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createMobileMenuFocusController } from '../../../src/features/navigation/mobile-menu-focus-controller.ts';

function createController() {
  const dom = new JSDOM('<button id="menuBtn">菜单</button><nav id="sidebar"><button id="sideLink">链接</button></nav><main id="main" tabindex="-1"></main>');
  const document = dom.window.document;
  let open = true;
  const scheduled = [];
  const focused = [];
  const menuButton = document.querySelector('#menuBtn');
  const main = document.querySelector('#main');
  const nativeMenuFocus = menuButton.focus.bind(menuButton);
  const nativeMainFocus = main.focus.bind(main);
  menuButton.focus = options => { focused.push(['menu', options]); nativeMenuFocus(); };
  main.focus = options => { focused.push(['main', options]); nativeMainFocus(); };
  const controller = createMobileMenuFocusController({
    document,
    isOpen: () => open,
    close: () => { open = false; },
    getSidebar: () => document.querySelector('#sidebar'),
    getMenuButton: () => menuButton,
    getMain: () => main,
    scheduleFocus: callback => scheduled.push(callback)
  });
  return { dom, document, controller, scheduled, focused };
}

test('closing the drawer restores focus to the main content when focus was inside it', () => {
  const harness = createController();
  const link = harness.document.querySelector('#sideLink');
  link.focus();

  assert.equal(harness.controller.close(), true);
  assert.equal(harness.scheduled.length, 1);
  harness.scheduled[0]();
  assert.equal(harness.document.activeElement, harness.document.querySelector('#main'));
  assert.deepEqual(harness.focused, [['main', { preventScroll: true }]]);
  harness.dom.window.close();
});

test('explicit close returns focus to the menu button even when focus is outside the drawer', () => {
  const harness = createController();
  harness.document.querySelector('#main').focus();

  assert.equal(harness.controller.close(true), true);
  harness.scheduled[0]();
  assert.equal(harness.document.activeElement, harness.document.querySelector('#menuBtn'));
  assert.deepEqual(harness.focused, [['main', undefined], ['menu', { preventScroll: true }]]);
  harness.dom.window.close();
});

test('closing an already closed drawer or one with focus outside does not move focus', () => {
  const harness = createController();

  assert.equal(harness.controller.close(), false);
  assert.equal(harness.scheduled.length, 0);
  assert.equal(harness.controller.close(), false);
  assert.equal(harness.focused.length, 0);
  harness.dom.window.close();
});
