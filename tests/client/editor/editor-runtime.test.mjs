import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createEditorRuntimeController } from '../../../src/features/editor/runtime-controller.ts';

test('editor runtime mounts the editor once, connects fields and search, and removes listeners on teardown', () => {
  const dom = new JSDOM(`
    <div class="note-shell">
      <input id="editTitle"><select id="editType"></select><select id="editCategory"></select>
      <input id="editTags"><input id="editSource"><select id="editPasteMode"><option value="rich">Rich</option><option value="plain">Plain</option></select>
      <div id="editorToolbar"><button type="button">Tool</button></div>
      <button id="editorFindToggle"></button><div class="editor-find" hidden><input id="editorFindInput"><span id="editorFindCount"></span><button id="editorFindPrev"></button><button id="editorFindNext"></button><button id="editorFindClose"></button></div>
      <div id="editorSurface"><p>Text</p></div><div id="editorMarkdownPreview" hidden></div><button id="editorMarkdownPreviewToggle">预览笔记格式</button>
    </div>
  `, { pretendToBeVisual: true });
  const document = dom.window.document;
  const surface = document.querySelector('#editorSurface');
  const events = [];
  let editor = null;
  const factory = options => {
    events.push(['factory', options.content]);
    return {
      isDestroyed: false,
      state: { selection: { from: 1, to: 1 } },
      view: { posAtDOM: () => 1 },
      commands: { focus: () => events.push(['focus']) },
      destroy() { this.isDestroyed = true; events.push(['destroy']); }
    };
  };
  const runtime = createEditorRuntimeController({
    getEditor: () => editor,
    setEditor: value => { editor = value; },
    getEditorFactory: () => factory,
    setEditorFactory() {},
    getSurface: () => surface,
    getElement: selector => document.querySelector(selector),
    isActive: () => true,
    getInitialContent: () => '<p>Initial</p>',
    getPasteMode: () => 'plain',
    getDraftId: () => 'note-1',
    renderMarkdownPreview: () => '<h2>预览标题</h2><p><a href="https://example.com">链接</a></p>',
    handlePaste() {},
    onUpdate: () => events.push(['update']),
    onSelectionUpdate: () => events.push(['selection']),
    onBlur: () => events.push(['blur']),
    onSlashMenu: () => events.push(['slash']),
    onFieldChange: () => events.push(['field']),
    onPasteModeChange: mode => events.push(['paste', mode]),
    onToolbarMouseDown: () => events.push(['toolbar']),
    onMounted: () => events.push(['mounted']),
    onBeforeDestroy: (_current, id) => events.push(['before-destroy', id])
  });

  assert.equal(runtime.mount(), editor);
  assert.equal(runtime.mount(), editor, 'a repeated mount does not create another editor');
  assert.equal(events.filter(([name]) => name === 'factory').length, 1);
  assert.equal(document.querySelector('#editPasteMode').value, 'plain');
  document.querySelector('#editTitle').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  document.querySelector('#editPasteMode').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  surface.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));
  document.querySelector('#editorFindToggle').click();
  assert.equal(document.querySelector('.editor-find').hidden, false);
  assert.ok(events.some(([name]) => name === 'field'));
  assert.ok(events.some(([name, value]) => name === 'paste' && value === 'plain'));
  assert.ok(events.some(([name]) => name === 'slash'));

  runtime.destroy();
  assert.ok(events.some(([name, id]) => name === 'before-destroy' && id === 'note-1'));
  assert.equal(editor, null);
  assert.equal(surface.isConnected, true);
  assert.equal(document.querySelector('.editor-find').hidden, false);
  document.querySelector('#editorFindClose').click();
  assert.equal(events.filter(([name]) => name === 'focus').length, 0, 'search listeners are removed on teardown');
  assert.equal(surface.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })), true);
  assert.equal(events.filter(([name]) => name === 'slash').length, 1, 'the slash listener is removed on teardown');
  dom.window.close();
});

test('editor Markdown preview toggles between rendered output and the unchanged editor surface', () => {
  const dom = new JSDOM('<button id="editorFindToggle"></button><div class="editor-find" hidden><input id="editorFindInput"><span id="editorFindCount"></span><button id="editorFindPrev"></button><button id="editorFindNext"></button><button id="editorFindClose"></button></div><div id="editorSurface"></div><div id="editorMarkdownPreview" hidden></div><button id="editorMarkdownPreviewToggle">预览笔记格式</button>');
  const document = dom.window.document;
  const events = [];
  const surface = document.querySelector('#editorSurface');
  let editor = null;
  const createdEditor = { isDestroyed: false, commands: { focus: () => events.push('focus') }, destroy() {} };
  const runtime = createEditorRuntimeController({
    getEditor: () => editor,
    setEditor: value => { editor = value; },
    getEditorFactory: () => () => createdEditor,
    setEditorFactory() {},
    getSurface: () => surface,
    getElement: selector => document.querySelector(selector),
    isActive: () => true,
    getInitialContent: () => '',
    getPasteMode: () => 'rich',
    getDraftId: () => 'note-preview',
    renderMarkdownPreview: () => '<h2>参考</h2><p><a href="https://example.com">文档</a></p>',
    handlePaste() {},
    onUpdate() {}, onSelectionUpdate() {}, onBlur() {}, onSlashMenu() {}, onFieldChange() {},
    onPasteModeChange() {}, onToolbarMouseDown() {}, onMounted() {}, onBeforeDestroy() {}
  });

  runtime.mount();
  const button = document.querySelector('#editorMarkdownPreviewToggle');
  const preview = document.querySelector('#editorMarkdownPreview');
  button.click();
  assert.equal(surface.hidden, true);
  assert.equal(preview.hidden, false);
  assert.match(preview.innerHTML, /<h2>参考<\/h2>/);
  assert.equal(button.textContent, '继续编辑');
  button.click();
  assert.equal(surface.hidden, false);
  assert.equal(preview.hidden, true);
  assert.equal(button.textContent, '预览笔记格式');
  assert.deepEqual(events, ['focus']);
  runtime.destroy();
  dom.window.close();
});
