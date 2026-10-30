import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createMobileMenuFocusController } from '../../../src/features/navigation/mobile-menu-focus-controller.ts';

function createController() {
  const dom = new JSDOM('<button id="menuBtn">菜单</button><nav id="sidebar"><a id="skipToMain" href="#dashboardHost">跳到主要内容</a><button id="newSide">新建笔记</button><button id="first" class="side-link">首页</button><button id="active" class="side-link active">当前页</button><button id="last" class="side-link">末项</button></nav><main id="main" tabindex="-1"></main>');
  const document = dom.window.document;
  let open = true;
  const scheduled = [];
  const focused = [];
  for (const element of document.querySelectorAll('#sidebar button, #sidebar a')) {
    element.getClientRects = () => [{ width: 80, height: 32 }];
  }
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
  const link = harness.document.querySelector('#active');
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

test('opening the drawer focuses the active navigation item before earlier inactive links', () => {
  const harness = createController();

  harness.controller.focusInitial();
  assert.equal(harness.scheduled.length, 1);
  harness.scheduled[0]();
  assert.equal(harness.document.activeElement, harness.document.querySelector('#active'));
  harness.dom.window.close();
});

test('Tab and Shift+Tab stay inside the open drawer and wrap at both boundaries', () => {
  const harness = createController();
  const first = harness.document.querySelector('#skipToMain');
  const last = harness.document.querySelector('#last');
  const release = harness.controller.attach();

  last.focus();
  const forward = new harness.dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  harness.document.dispatchEvent(forward);
  assert.equal(forward.defaultPrevented, true);
  assert.equal(harness.document.activeElement, first);

  first.focus();
  const backward = new harness.dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  harness.document.dispatchEvent(backward);
  assert.equal(backward.defaultPrevented, true);
  assert.equal(harness.document.activeElement, last);

  release();
  harness.dom.window.close();
});

test('Tab returns focus to the drawer if focus was moved outside while it is open', () => {
  const harness = createController();
  const release = harness.controller.attach();
  const menuButton = harness.document.querySelector('#menuBtn');
  menuButton.focus();

  const event = new harness.dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  harness.document.dispatchEvent(event);

  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.document.activeElement, harness.document.querySelector('#skipToMain'));
  release();
  harness.dom.window.close();
});
