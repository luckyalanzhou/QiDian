import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createLegacyEditorToolbarView } from '../src/features/editor/legacy-toolbar-view.ts';

function createFixture() {
  const dom = new JSDOM(`
    <main id="main">
      <div class="editor-fields-wrap"><div class="editor-fields" id="fields">Properties</div></div>
      <div id="editorToolbar">
        <button data-fmt="bold">Bold</button><button data-fmt="strikeThrough">Strike</button>
        <select id="blockSelect"><option value="p">Paragraph</option><option value="h2">Heading</option></select>
        <span class="table-tools"><button data-table-action="deleteTable">Delete table</button></span>
        <span class="code-tools"><button data-editor-action="delete-code-block">Delete code</button></span>
        <button data-insert="emoji">Emoji</button>
        <button data-editor-action="unlink">Unlink</button>
      </div>
      <div class="doc-action-row"><button id="exportHtml">Export</button><button id="deleteEditorNote">Delete</button></div>
      <div class="bottom-action"><button data-insert="emoji">Duplicate emoji</button><button data-insert="rule">Rule</button></div>
    </main>
  `, { pretendToBeVisual: true });
  const document = dom.window.document;
  const toolbarState = {
    marks: { bold: true, italic: false, underline: false, strikeThrough: false, code: false },
    block: 'h2', inTable: false, inCodeBlock: false, inCallout: true,
    canUndo: false, canRedo: true, hasLink: true, canConvertTable: true,
    paragraph: { visible: true, moveUp: false, moveDown: true, duplicate: true, delete: false }
  };
  const actions = [];
  const controller = createLegacyEditorToolbarView({
    document,
    window: dom.window,
    getToolbar: () => document.querySelector('#editorToolbar'),
    getMain: () => document.querySelector('#main'),
    getElement: selector => document.querySelector(selector),
    getToolbarState: () => toolbarState,
    getEditing: () => true,
    icons: () => '<svg></svg>',
    onEditorAction: action => actions.push(['editor', action]),
    onParagraphAction: action => actions.push(['paragraph', action]),
    onDeleteCallout: () => actions.push(['callout'])
  });
  return { dom, document, controller, toolbarState, actions };
}

test('legacy toolbar view applies typed editor state and wires its contextual controls', () => {
  const { dom, document, controller, actions } = createFixture();
  const editor = { isActive: () => false };
  controller.organize();
  controller.sync(editor);
  controller.sync(editor);

  const toolbar = document.querySelector('#editorToolbar');
  assert.equal(toolbar.querySelector('[data-fmt="bold"]').getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelector('#blockSelect').value, 'h2');
  assert.equal(toolbar.querySelector('.table-tools').hidden, true);
  assert.equal(toolbar.querySelector('[data-table-action]').disabled, true);
  assert.equal(toolbar.querySelector('.code-tools').hidden, true);
  assert.equal(toolbar.querySelector('[data-editor-action="delete-code-block"]').disabled, true);
  assert.equal(toolbar.querySelector('[data-block-action="moveUp"]').disabled, true);
  assert.equal(toolbar.querySelector('[data-block-action="moveDown"]').disabled, false);
  assert.equal(toolbar.querySelector('[data-editor-action="undo"]').disabled, true);
  assert.equal(toolbar.querySelector('[data-editor-action="redo"]').disabled, false);
  assert.equal(toolbar.querySelector('[data-editor-action="unlink"]').disabled, false);
  assert.equal(toolbar.querySelector('[data-delete-block="callout"]').disabled, false);
  assert.equal(toolbar.querySelectorAll('.editor-core-actions').length, 1);

  toolbar.querySelector('[data-editor-action="clear-format"]').click();
  toolbar.querySelector('[data-delete-block="callout"]').click();
  assert.deepEqual(actions, [['editor', 'clear-format'], ['callout']]);
  dom.window.close();
});

test('legacy toolbar organization groups properties and extra actions and preserves document actions', () => {
  const { dom, document, controller, actions } = createFixture();
  controller.organize();

  assert.equal(document.querySelector('.editor-properties #fields') !== null, true);
  assert.equal(document.querySelector('.document-more #exportHtml') !== null, true);
  assert.equal(document.querySelector('.document-more #deleteEditorNote') !== null, true);
  assert.equal(document.querySelector('.bottom-action'), null);
  assert.equal(document.querySelectorAll('.editor-extra-panel [data-insert="emoji"]').length, 1);
  assert.equal(document.querySelector('.editor-extra-panel [data-insert="rule"]') !== null, true);

  document.querySelector('.editor-extra-panel [data-editor-action="convert-table"]').click();
  document.querySelector('.editor-extra-panel [data-block-action="duplicate"]').click();
  assert.deepEqual(actions, [['editor', 'convert-table'], ['paragraph', 'duplicate']]);
  dom.window.close();
});
