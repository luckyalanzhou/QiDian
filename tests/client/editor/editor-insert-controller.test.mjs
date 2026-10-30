import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorInsertController } from '../../../src/features/editor/insert-controller.ts';

function harness(options = {}) {
  const events = [];
  let editor = options.editor === false ? null : {
    chain() {
      const chain = {
        focus() { events.push(['focus']); return chain; },
        insertTable(value) { events.push(['insert-table', value]); return chain; },
        extendMarkRange(value) { events.push(['extend-mark-range', value]); return chain; },
        setMark(name, value) { events.push(['set-mark', name, value]); return chain; },
        run() { events.push(['run']); return options.runResult ?? true; }
      };
      return chain;
    },
    commands: { focus: () => events.push(['command-focus']), scrollIntoView: () => events.push(['scroll']) },
    isActive: () => Boolean(options.editingLink),
    getAttributes: () => ({ href: options.currentUrl || '' }),
    state: { selection: { from: options.selectionFrom ?? 1, to: options.selectionTo ?? 1 } }
  };
  const controller = createEditorInsertController({
    getEditor: () => editor,
    insertHTML: html => events.push(['insert-html', html]),
    openImagePicker: () => events.push(['image-picker']),
    prompt: async (...args) => { events.push(['prompt', ...args]); return options.promptValue ?? null; },
    format: (...args) => events.push(['format', ...args]),
    afterChange: value => events.push(['after-change', value]),
    safeUrl: options.safeUrl || (value => /^https?:\/\//i.test(value)),
    escapeHTML: value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]),
    toast: message => events.push(['toast', message])
  });
  return { controller, events, setEditor: value => { editor = value; } };
}

test('image insertion opens the existing image picker', async () => {
  const { controller, events } = harness();
  await controller.insert('image');
  assert.deepEqual(events, [['image-picker']]);
});

test('table insertion reports a missing editor and only completes after insertion succeeds', async () => {
  const unavailable = harness({ editor: false });
  await unavailable.controller.insert('table');
  assert.deepEqual(unavailable.events, [['toast', '编辑器尚未就绪，请稍后再试']]);

  const rejected = harness({ runResult: false });
  await rejected.controller.insert('table');
  assert.deepEqual(rejected.events.at(-1), ['toast', '请先点击正文中的插入位置，再添加表格']);
  assert.equal(rejected.events.some(event => event[0] === 'after-change'), false);

  const accepted = harness();
  await accepted.controller.insert('table');
  assert.deepEqual(accepted.events[1], ['insert-table', { rows: 3, cols: 2, withHeaderRow: true }]);
  assert.equal(accepted.events.some(event => event[0] === 'command-focus'), true);
  assert.equal(accepted.events.some(event => event[0] === 'scroll'), true);
  assert.equal(accepted.events.some(event => event[0] === 'after-change'), true);
});

test('structured insertions delegate safe markup to the editor insertion boundary', async () => {
  const { controller, events } = harness();
  for (const kind of ['code', 'rule', 'callout', 'details']) await controller.insert(kind);
  assert.deepEqual(events.filter(event => event[0] === 'insert-html').map(event => event[1]), [
    '<pre><code>在这里粘贴代码或配置</code></pre><p></p>',
    '<hr><p></p>',
    '<div class="callout">📌 在这里填写提示内容</div><p></p>',
    '<details><summary>点击展开</summary><div data-type="detailsContent"><p>在这里填写折叠内容</p></div></details><p></p>'
  ]);
});

test('link insertion applies the URL to a selection or inserts a safe escaped anchor', async () => {
  const selected = harness({ promptValue: 'https://example.com', selectionFrom: 1, selectionTo: 4 });
  await selected.controller.insert('link');
  assert.deepEqual(selected.events.find(event => event[0] === 'format'), ['format', 'createLink', 'https://example.com']);

  const collapsed = harness({ promptValue: 'https://example.com/a?x="quoted"' });
  await collapsed.controller.insert('link');
  assert.equal(collapsed.events.find(event => event[0] === 'insert-html')[1], '<a href="https://example.com/a?x=&quot;quoted&quot;" rel="noopener noreferrer" target="_blank">https://example.com/a?x=&quot;quoted&quot;</a>');
});

test('editing a link starts with its current URL and commits only a safe replacement', async () => {
  const { controller, events } = harness({ editingLink: true, currentUrl: 'https://old.example', promptValue: 'https://new.example' });
  await controller.insert('link');
  assert.equal(events.find(event => event[0] === 'prompt')[2], 'https://old.example');
  assert.deepEqual(events.find(event => event[0] === 'set-mark'), ['set-mark', 'link', { href: 'https://new.example' }]);
  assert.equal(events.some(event => event[0] === 'after-change'), true);
});

test('unsafe links are rejected and emoji text is escaped before insertion', async () => {
  const rejected = harness({ promptValue: 'javascript:alert(1)' });
  await rejected.controller.insert('link');
  assert.deepEqual(rejected.events.at(-1), ['toast', '只支持安全的 http、https 等链接']);
  assert.equal(rejected.events.some(event => event[0] === 'insert-html'), false);

  const emoji = harness({ promptValue: '<img src=x onerror=alert(1)>' });
  await emoji.controller.insert('emoji');
  assert.equal(emoji.events.find(event => event[0] === 'insert-html')[1], '&lt;img src=x onerror=alert(1)&gt;');
});
