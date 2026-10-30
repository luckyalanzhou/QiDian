import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorCommandController, parseDelimitedTable } from '../../../src/features/editor/command-controller.ts';

test('editor command parser converts Markdown tables and removes the separator row', () => {
  assert.deepEqual(parseDelimitedTable('| 名称 | 值 |\n| --- | :---: |\n| 端口 | 9908 |'), [
    ['名称', '值'],
    ['端口', '9908']
  ]);
});

test('editor command parser pads tab-separated rows and rejects unsupported dimensions', () => {
  assert.deepEqual(parseDelimitedTable('名称\t值\n端口\t9908\t默认'), [
    ['名称', '值', ''],
    ['端口', '9908', '默认']
  ]);
  assert.equal(parseDelimitedTable('单列'), null);
  assert.equal(parseDelimitedTable(Array.from({ length: 51 }, () => 'a\tb').join('\n')), null);
  assert.equal(parseDelimitedTable(Array.from({ length: 13 }, (_, index) => `c${index}`).join('\t')), null);
});

test('editor delete-callout command removes only an active callout and updates the editor state', () => {
  const calls = [];
  let active = true;
  const editor = {
    chain: () => ({
      focus() { calls.push('focus'); return this; },
      deleteNode(name) { calls.push(['deleteNode', name]); return this; },
      run() { calls.push('run'); return true; }
    }),
    isActive: name => active && name === 'callout'
  };
  const controller = createEditorCommandController({ getEditor: () => editor, afterChange: value => calls.push(['changed', value]), toast() {} });
  controller.runEditorAction('delete-callout');
  assert.deepEqual(calls, ['focus', ['deleteNode', 'callout'], 'run', ['changed', editor]]);

  calls.length = 0;
  active = false;
  controller.runEditorAction('delete-callout');
  assert.deepEqual(calls, ['focus', ['changed', editor]], 'the command does not remove an unrelated active block');
});
