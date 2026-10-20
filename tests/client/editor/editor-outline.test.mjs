import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorOutlineController } from '../../../src/features/editor/outline-controller.ts';

test('editor outline snapshots headings from the document and navigates through editor commands', () => {
  const headingNodes = [
    { type: { name: 'heading' }, attrs: { level: 2 }, textContent: '  Network\n setup  ' },
    { type: { name: 'paragraph' }, attrs: {}, textContent: 'not a heading' },
    { type: { name: 'heading' }, attrs: { level: 3 }, textContent: 'DNS' },
    { type: { name: 'heading' }, attrs: { level: 7 }, textContent: 'invalid level' },
    { type: { name: 'heading' }, attrs: { level: 2 }, textContent: '   ' }
  ];
  const selections = [];
  const focused = [];
  const scrolled = [];
  const editor = {
    state: { doc: { content: { size: 40 }, descendants: visit => headingNodes.forEach((node, index) => visit(node, index * 4)) } },
    commands: {
      setTextSelection: position => { selections.push(position); },
      focus: () => { focused.push(true); }
    },
    view: { nodeDOM: position => ({ scrollIntoView: options => scrolled.push([position, options.block]) }) }
  };
  let current = null;
  const controller = createEditorOutlineController({ getEditor: () => editor, setOutline: items => { current = items; } });

  assert.deepEqual(controller.sync(), [
    { level: 2, text: 'Network setup', position: 1 },
    { level: 3, text: 'DNS', position: 9 }
  ]);
  assert.deepEqual(current, [
    { level: 2, text: 'Network setup', position: 1 },
    { level: 3, text: 'DNS', position: 9 }
  ]);
  controller.goTo(9);
  controller.goTo(100);
  assert.deepEqual(selections, [9, 40]);
  assert.deepEqual(focused, [true, true]);
  assert.deepEqual(scrolled, [[8, 'center'], [39, 'center']]);
});

test('editor outline clears when the editor is unavailable', () => {
  let current = [{ level: 2, text: '旧目录', position: 1 }];
  const controller = createEditorOutlineController({ getEditor: () => null, setOutline: items => { current = items; } });
  assert.deepEqual(controller.sync(), []);
  assert.deepEqual(current, []);
});
