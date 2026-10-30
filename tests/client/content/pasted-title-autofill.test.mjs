import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createPastedTitleAutofill } from '../../../src/features/content/pasted-title-autofill.ts';

test('pasted heading fills an empty title field and emits a bubbling input event', () => {
  const dom = new JSDOM('<input id="editTitle">');
  const field = dom.window.document.querySelector('#editTitle');
  const inputEvents = [];
  dom.window.document.addEventListener('input', event => inputEvents.push(event.target.id));
  const autofill = createPastedTitleAutofill({
    document: dom.window.document,
    extractPastedTitle: () => '粘贴标题'
  });

  assert.equal(autofill('editTitle', '<h1>粘贴标题</h1>', ''), true);
  assert.equal(field.value, '粘贴标题');
  assert.deepEqual(inputEvents, ['editTitle']);
  dom.window.close();
});

test('pasted title does not overwrite a manually entered title', () => {
  const dom = new JSDOM('<input id="captureName" value="手动标题">');
  let extracted = false;
  const autofill = createPastedTitleAutofill({
    document: dom.window.document,
    extractPastedTitle: () => { extracted = true; return '粘贴标题'; }
  });

  assert.equal(autofill('captureName', '<h1>粘贴标题</h1>', ''), false);
  assert.equal(dom.window.document.querySelector('#captureName').value, '手动标题');
  assert.equal(extracted, false);
  dom.window.close();
});

test('missing fields and content without a heading leave the title unchanged', () => {
  const dom = new JSDOM('<input id="editTitle" value="">');
  const autofill = createPastedTitleAutofill({
    document: dom.window.document,
    extractPastedTitle: () => ''
  });

  assert.equal(autofill('missingTitle', '<p>正文</p>', '正文'), false);
  assert.equal(autofill('editTitle', '<p>正文</p>', '正文'), false);
  assert.equal(dom.window.document.querySelector('#editTitle').value, '');
  dom.window.close();
});
