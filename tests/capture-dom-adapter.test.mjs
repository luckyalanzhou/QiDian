import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createCaptureDOMAdapter } from '../src/features/capture/capture-dom-adapter.ts';

function setup(markup = '<div id="capture" contenteditable="true"></div><div id="outside"></div>') {
  const dom = new JSDOM(markup, { pretendToBeVisual: true });
  const document = dom.window.document;
  const pad = document.querySelector('#capture');
  const adapter = createCaptureDOMAdapter({ window: dom.window, document, getPad: () => pad });
  return { dom, document, pad, adapter };
}

function selectContents(window, element) {
  const range = window.document.createRange();
  range.selectNodeContents(element);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  return range;
}

test('capture selection only returns ranges whose common ancestor is inside the capture pad', () => {
  const { dom, document, pad, adapter } = setup('<div id="capture"><p>摘录</p></div><div id="outside">其他</div>');
  selectContents(dom.window, pad.querySelector('p'));
  assert.equal(adapter.captureSelection(pad).toString(), '摘录');
  selectContents(dom.window, document.querySelector('#outside'));
  assert.equal(adapter.captureSelection(pad), null);
  dom.window.close();
});

test('HTML insertion replaces the saved selection and places the caret after inserted content', () => {
  const { dom, pad, adapter } = setup('<div id="capture"><p>old text</p></div>');
  const text = pad.querySelector('p').firstChild;
  const range = dom.window.document.createRange();
  range.setStart(text, 0);
  range.setEnd(text, 3);
  adapter.insertHTML('<strong>new</strong>', range);
  assert.equal(pad.innerHTML, '<p><strong>new</strong> text</p>');
  const selection = dom.window.getSelection();
  assert.equal(selection.isCollapsed, true);
  assert.equal(selection.anchorNode, pad.querySelector('p'));
  assert.equal(selection.anchorOffset, 2);
  dom.window.close();
});

test('plain capture text preserves line breaks while replacing the selected text', () => {
  const { dom, pad, adapter } = setup('<div id="capture"><p>before AFTER end</p></div>');
  const text = pad.querySelector('p').firstChild;
  const range = dom.window.document.createRange();
  range.setStart(text, 7);
  range.setEnd(text, 12);
  adapter.insertText('one\ntwo\n', range);
  assert.equal(pad.innerHTML, '<p>before one<br>two<br> end</p>');
  dom.window.close();
});

test('plain capture text inside code keeps newlines as literal text', () => {
  const { dom, pad, adapter } = setup('<div id="capture"><pre><code>old</code></pre></div>');
  const code = pad.querySelector('code').firstChild;
  const range = dom.window.document.createRange();
  range.selectNodeContents(code.parentElement);
  adapter.insertText('line one\nline two', range);
  assert.equal(pad.querySelector('code').textContent, 'line one\nline two');
  assert.equal(pad.querySelector('code br'), null);
  dom.window.close();
});

test('capture insertion appends and focuses the pad when no selection is available', () => {
  const { dom, pad, adapter } = setup();
  adapter.insertHTML('<p>追加内容</p>');
  assert.equal(pad.innerHTML, '<p>追加内容</p>');
  assert.equal(dom.window.document.activeElement, pad);
  dom.window.close();
});
