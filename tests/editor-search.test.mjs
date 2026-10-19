import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountEditorSearch } from '../src/features/editor/search-controller.ts';

test('editor search matches case-insensitively and cycles through results', () => {
  const dom = new JSDOM(`
    <article class="editor-card">
      <button id="toggle"></button>
      <div class="editor-find" hidden>
        <input id="query"><span id="count"></span>
        <button id="previous"></button><button id="next"></button><button id="close"></button>
      </div>
      <div id="surface"><p>Alpha <strong>beta</strong> ALPHA</p></div>
    </article>
  `);
  const document = dom.window.document;
  const selections = [];
  let focusCount = 0;
  const editor = {
    view: { posAtDOM: (node, offset) => node.textContent.indexOf('Alpha') + offset },
    commands: {
      setTextSelection: selection => selections.push(selection),
      focus: () => { focusCount += 1; }
    }
  };
  const byId = id => document.querySelector(`#${id}`);
  const input = byId('query');
  const panel = document.querySelector('.editor-find');
  const cleanup = mountEditorSearch({
    editor,
    root: byId('surface'),
    surface: byId('surface'),
    toggleButton: byId('toggle'),
    panel,
    input,
    count: byId('count'),
    previousButton: byId('previous'),
    nextButton: byId('next'),
    closeButton: byId('close')
  });

  input.value = 'alpha';
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(byId('count').textContent, '1 / 2');
  assert.equal(selections.length, 1);
  byId('next').click();
  assert.equal(byId('count').textContent, '2 / 2');
  byId('next').click();
  assert.equal(byId('count').textContent, '1 / 2');
  byId('previous').click();
  assert.equal(byId('count').textContent, '2 / 2');

  byId('toggle').click();
  assert.equal(panel.hidden, false);
  byId('close').click();
  assert.equal(panel.hidden, true);
  assert.equal(input.value, '');
  assert.equal(focusCount, 1);
  cleanup();
  byId('toggle').click();
  assert.equal(panel.hidden, true);
  dom.window.close();
});

test('Ctrl or Command+F opens editor search without invoking browser search', () => {
  const dom = new JSDOM(`<div class="editor-find" hidden><input id="query"><span id="count"></span><button id="previous"></button><button id="next"></button><button id="close"></button></div><button id="toggle"></button><div id="surface"><p>content</p></div>`);
  const document = dom.window.document;
  const input = document.querySelector('#query');
  const panel = document.querySelector('.editor-find');
  const cleanup = mountEditorSearch({
    editor: { view: { posAtDOM: () => 0 }, commands: { setTextSelection() {}, focus() {} } },
    root: document.querySelector('#surface'),
    surface: document.querySelector('#surface'),
    toggleButton: document.querySelector('#toggle'),
    panel,
    input,
    count: document.querySelector('#count'),
    previousButton: document.querySelector('#previous'),
    nextButton: document.querySelector('#next'),
    closeButton: document.querySelector('#close')
  });
  const event = new dom.window.KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true });
  document.querySelector('#surface').dispatchEvent(event);
  assert.equal(panel.hidden, false);
  assert.equal(event.defaultPrevented, true);
  cleanup();
  dom.window.close();
});
