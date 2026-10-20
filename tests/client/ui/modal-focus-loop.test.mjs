import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountModalFocusLoop } from '../../../src/features/dialogs/modal-focus-loop.ts';

test('modal focus loop wraps only within the topmost open dialog', () => {
  const dom = new JSDOM(`
    <div class="overlay open" id="backgroundDialog"><button id="backgroundFirst">Background</button></div>
    <div class="overlay open" id="topDialog"><button id="first">First</button><button id="disabled" disabled>Disabled</button><button id="hidden" hidden>Hidden</button><button id="last">Last</button></div>
  `);
  const { document, KeyboardEvent } = dom.window;
  const unmount = mountModalFocusLoop(document);
  const first = document.querySelector('#first');
  const last = document.querySelector('#last');

  last.focus();
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, true);
  assert.equal(document.activeElement, first, 'Tab from the final control wraps to the first control in the top dialog');

  first.focus();
  const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(shiftTab);
  assert.equal(shiftTab.defaultPrevented, true);
  assert.equal(document.activeElement, last, 'Shift+Tab from the first control wraps to the final control');

  document.querySelector('#backgroundFirst').focus();
  const unrelatedTab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(unrelatedTab);
  assert.equal(unrelatedTab.defaultPrevented, false, 'the focus loop does not steal focus from another overlay');

  unmount();
  dom.window.close();
});
