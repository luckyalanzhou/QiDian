import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createLegacyEditorOutlineView } from '../src/features/editor/legacy-editor-outline-view.ts';

function createView() {
  const dom = new JSDOM(`
    <main id="main">
      <div class="note-shell">
        <details class="editor-outline-mobile"><nav class="editor-outline-links"></nav></details>
        <aside class="right-rail edit-inspector"><nav class="editor-outline-links"></nav></aside>
        <section class="editor-card"><div id="editorSurface"><h2>第一节</h2><h3>&lt;script&gt;标题&lt;/script&gt;</h3></div></section>
      </div>
    </main>
  `);
  const document = dom.window.document;
  const view = createLegacyEditorOutlineView({ document, main: document.querySelector('#main') });
  return { dom, document, view };
}

test('legacy editor outline renders safe headings in both navigation rails and jumps to selection', () => {
  const { dom, document, view } = createView();
  const scrolled = [];
  const selection = [];
  const heading = document.querySelector('#editorSurface h3');
  heading.scrollIntoView = options => scrolled.push(options);
  const editor = {
    view: { posAtDOM: (node, offset) => { assert.equal(node, heading); assert.equal(offset, 0); return 12; } },
    commands: { setTextSelection: position => selection.push(position) },
    state: { doc: { content: { size: 100 } } }
  };

  assert.equal(view.render(editor), 2);
  assert.equal(document.querySelector('.editor-outline-mobile').hidden, false);
  assert.equal(document.querySelector('.edit-inspector').hidden, false);
  assert.equal(document.querySelectorAll('.editor-outline-links [data-outline-index]').length, 4);
  assert.equal(document.querySelectorAll('.editor-outline-links script').length, 0);
  assert.equal(document.querySelector('.right-rail .editor-outline-links')?.textContent.includes('<script>标题</script>'), true);
  document.querySelector('.editor-outline-mobile [data-outline-index="1"]').click();
  assert.deepEqual(selection, [13]);
  assert.deepEqual(scrolled, [{ block: 'center' }]);
  view.dispose();
  dom.window.close();
});

test('legacy editor outline refresh replaces click handlers and hides empty outlines', () => {
  const { dom, document, view } = createView();
  let selections = 0;
  const editor = {
    view: { posAtDOM: () => 10 },
    commands: { setTextSelection: () => { selections += 1; } },
    state: { doc: { content: { size: 100 } } }
  };

  view.render(editor);
  view.render(editor);
  document.querySelector('.right-rail .editor-outline-links [data-outline-index="0"]')?.click();
  assert.equal(selections, 1, 're-rendering does not stack click handlers');

  document.querySelector('#editorSurface').innerHTML = '<h2>   </h2>';
  assert.equal(view.render(editor), 0);
  assert.equal(document.querySelector('.editor-outline-mobile').hidden, true);
  assert.equal(document.querySelector('.edit-inspector').hidden, true);
  assert.equal(document.querySelector('.editor-outline-links').textContent, '暂无标题');
  view.dispose();
  dom.window.close();
});
