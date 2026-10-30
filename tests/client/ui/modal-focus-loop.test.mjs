import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountModalFocusLoop } from '../../../src/features/dialogs/modal-focus-loop.ts';

test('modal focus loop wraps only within the topmost open dialog', () => {
  const dom = new JSDOM(`
    <div class="overlay open" id="backgroundDialog"><section role="dialog"><button id="backgroundFirst">Background</button></section></div>
    <div class="overlay open" id="topDialog"><section role="dialog" id="topDialogElement" tabindex="-1"><button id="first">First</button><button id="disabled" disabled>Disabled</button><button id="hidden" hidden>Hidden</button><button id="last">Last</button></section></div>
  `);
  const { document, KeyboardEvent } = dom.window;
  const unmount = mountModalFocusLoop(document);
  const dialog = document.querySelector('#topDialogElement');
  const first = document.querySelector('#first');
  const last = document.querySelector('#last');

  last.focus();
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, true);
  assert.equal(document.activeElement, first, 'Tab from the final control wraps to the first control in the top dialog');

  dialog.focus();
  const initialShiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(initialShiftTab);
  assert.equal(initialShiftTab.defaultPrevented, true);
  assert.equal(document.activeElement, last, 'Shift+Tab from the dialog container moves to its final control');

  dialog.focus();
  const initialTab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(initialTab);
  assert.equal(initialTab.defaultPrevented, true);
  assert.equal(document.activeElement, first, 'Tab from the dialog container moves to its first control');

  first.focus();
  const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(shiftTab);
  assert.equal(shiftTab.defaultPrevented, true);
  assert.equal(document.activeElement, last, 'Shift+Tab from the first control wraps to the final control');

  document.querySelector('#backgroundFirst').focus();
  const unrelatedTab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(unrelatedTab);
  assert.equal(unrelatedTab.defaultPrevented, true, 'Tab from a background overlay is kept in the topmost dialog');
  assert.equal(document.activeElement, first);

  document.querySelector('#backgroundFirst').focus();
  const backgroundShiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(backgroundShiftTab);
  assert.equal(backgroundShiftTab.defaultPrevented, true, 'Shift+Tab from a background overlay is kept in the topmost dialog');
  assert.equal(document.activeElement, last);

  unmount();
  dom.window.close();
});

test('modal focus loop preserves Tab navigation from a contenteditable control', () => {
  const dom = new JSDOM(`
    <div class="overlay open">
      <section role="dialog">
        <button id="close">Close</button>
        <div id="capturePad" contenteditable="true" tabindex="0">Capture text</div>
        <select id="pasteMode"><option>Rich</option></select>
        <button id="save">Save</button>
      </section>
    </div>
  `);
  const { document, KeyboardEvent } = dom.window;
  const unmount = mountModalFocusLoop(document);
  const editor = document.querySelector('#capturePad');

  editor.focus();
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, false, 'Tab from the editable capture area follows the document order');

  editor.focus();
  const shiftTab = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  document.dispatchEvent(shiftTab);
  assert.equal(shiftTab.defaultPrevented, false, 'Shift+Tab from the editable capture area follows the document order');

  unmount();
  dom.window.close();
});

test('modal focus loop includes visible tabindex controls and skips hidden descendants', () => {
  const dom = new JSDOM(`
    <div class="overlay open">
      <section role="dialog">
        <button id="close">Close</button>
        <pre id="visibleLog" tabindex="0">Update log</pre>
        <button id="save">Save</button>
        <section id="hiddenProgress" hidden><pre id="hiddenLog" tabindex="0">Old log</pre></section>
      </section>
    </div>
  `);
  const { document, KeyboardEvent } = dom.window;
  const unmount = mountModalFocusLoop(document);
  const visibleLog = document.querySelector('#visibleLog');
  const close = document.querySelector('#close');
  const save = document.querySelector('#save');

  visibleLog.focus();
  const tabFromLog = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(tabFromLog);
  assert.equal(tabFromLog.defaultPrevented, false, 'Tab from the visible log follows the document order');

  save.focus();
  const tabFromLastVisibleControl = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(tabFromLastVisibleControl);
  assert.equal(tabFromLastVisibleControl.defaultPrevented, true, 'a hidden descendant does not extend the modal tab order');
  assert.equal(document.activeElement, close);

  unmount();
  dom.window.close();
});

test('reauthentication dialog traps focus ahead of an inert workspace overlay', () => {
  const dom = new JSDOM(`
    <main id="app" inert><div class="overlay open"><button id="background">Background</button></div></main>
    <section id="loginGate" class="reauth" role="dialog" aria-modal="true">
      <input id="authPassword"><button id="authSubmit">Sign in</button>
    </section>
  `);
  const { document, KeyboardEvent } = dom.window;
  const unmount = mountModalFocusLoop(document);
  const password = document.querySelector('#authPassword');
  const submit = document.querySelector('#authSubmit');
  const background = document.querySelector('#background');

  background.focus();
  const tabFromBackground = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(tabFromBackground);
  assert.equal(tabFromBackground.defaultPrevented, true);
  assert.equal(document.activeElement, password);

  submit.focus();
  const tabFromLastControl = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  document.dispatchEvent(tabFromLastControl);
  assert.equal(tabFromLastControl.defaultPrevented, true);
  assert.equal(document.activeElement, password);

  unmount();
  dom.window.close();
});
