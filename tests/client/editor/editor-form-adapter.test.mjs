import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorFormAdapter } from '../../../src/features/editor/form-adapter.ts';

const form = overrides => ({ title: '标题', type: 'note', category: '未分类', tags: '#Linux, 教程，#OpenWrt', source: '', ...overrides });

test('editor form adapter prefers the Vue-owned form and normalizes its tags and body', () => {
  const calls = [];
  const adapter = createEditorFormAdapter({
    getVueForm: () => form(),
    getLegacyForm: () => { calls.push('legacy'); return form({ title: '旧表单' }); },
    getBodyHTML: () => '<script>bad()</script><p>正文</p>',
    cleanHTML: (html, strict) => { calls.push(['clean', strict]); return html.replace(/<script>.*?<\/script>/, ''); }
  });

  assert.deepEqual(adapter.readEditorFields(), {
    title: '标题', type: 'note', category: '未分类', tags: ['Linux', '教程', 'OpenWrt'], source: '', body: '<p>正文</p>'
  });
  assert.deepEqual(calls, [['clean', true]], 'the legacy form is not read when Vue owns the page');
});

test('editor form adapter reads the migration form and limits tags to thirty', () => {
  const tags = Array.from({ length: 31 }, (_, index) => `tag${index}`).join(',');
  const adapter = createEditorFormAdapter({
    getVueForm: () => null,
    getLegacyForm: () => form({ tags }),
    getBodyHTML: () => '<p>legacy body</p>',
    cleanHTML: html => html
  });

  const result = adapter.readEditorFields();
  assert.equal(result?.body, '<p>legacy body</p>');
  assert.equal(result?.tags.length, 30);
  assert.equal(result?.tags[0], 'tag0');
});

test('editor form adapter does not read body content when neither editor form exists', () => {
  let bodyRead = false;
  const adapter = createEditorFormAdapter({
    getVueForm: () => null,
    getLegacyForm: () => null,
    getBodyHTML: () => { bodyRead = true; return ''; },
    cleanHTML: html => html
  });

  assert.equal(adapter.readEditorFields(), null);
  assert.equal(bodyRead, false);
});
