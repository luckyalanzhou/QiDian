import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createDraftContentTools } from '../../../src/features/notes/draft-content.ts';

const dom = new JSDOM('<!doctype html>');
const tools = createDraftContentTools({
  cleanHTML: html => String(html || ''),
  parseHTML: html => new dom.window.DOMParser().parseFromString(html, 'text/html')
});

test('empty new notes and untouched structured templates are not draft content', () => {
  assert.equal(tools.hasDraftContent({ title: '', body: '', tags: [], source: '' }), false);
  assert.equal(tools.hasDraftContent({
    type: 'command', title: '', body: '<h2>用途</h2><p></p><h2>命令</h2><pre><code>在这里输入命令</code></pre>', tags: [], source: ''
  }), false);
  assert.equal(tools.hasDraftContent({
    type: 'issue', title: '', body: '<h2>问题现象</h2><p></p><h2>解决办法</h2><p></p><h2>排查过程</h2><p></p>', tags: [], source: ''
  }), false);
});

test('draft content recognizes meaningful metadata, text and images but ignores blank paragraphs', () => {
  assert.equal(tools.hasDraftContent({ title: '有标题', body: '', tags: [], source: '' }), true);
  assert.equal(tools.hasDraftContent({ title: '', body: '<p> &nbsp; </p>', tags: [], source: '' }), false);
  assert.equal(tools.hasDraftContent({ title: '', body: '<p>正文</p>', tags: [], source: '' }), true);
  assert.equal(tools.hasDraftContent({ title: '', body: '<img src="/api/assets/image">', tags: [], source: '' }), true);
});

test('editor baseline ignores empty paragraph markup and tracks actual note content', () => {
  const original = { title: '', body: '<p></p><p>正文</p>', tags: [], source: '' };
  const sameContent = { title: '', body: '<p>正文</p>', tags: [], source: '' };
  const changed = { title: '', body: '<p>正文已改</p>', tags: [], source: '' };

  assert.equal(tools.editorContentSnapshot(original), tools.editorContentSnapshot(sameContent));
  assert.notEqual(tools.editorContentSnapshot(original), tools.editorContentSnapshot(changed));
});

test.after(() => dom.window.close());
