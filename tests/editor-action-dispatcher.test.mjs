import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorActionDispatcher } from '../src/features/editor/action-dispatcher.ts';

function createDispatcher({ ready = true, insertResult } = {}) {
  const calls = [];
  const dispatcher = createEditorActionDispatcher({
    isReady: () => ready,
    goToOutline: position => calls.push(['outline', position]),
    format: (action, value) => calls.push(['format', action, value]),
    insert: action => { calls.push(['insert', action]); return insertResult; },
    table: action => calls.push(['table', action]),
    editor: action => calls.push(['editor', action]),
    paragraph: action => calls.push(['paragraph', action])
  });
  return { dispatcher, calls };
}

test('editor action dispatcher routes every toolbar command group with its payload', () => {
  const { dispatcher, calls } = createDispatcher();
  dispatcher.dispatch({ group: 'outline', action: 'goto', position: 14 });
  dispatcher.dispatch({ group: 'format', action: 'formatBlock', value: 'h2' });
  dispatcher.dispatch({ group: 'insert', action: 'table' });
  dispatcher.dispatch({ group: 'table', action: 'deleteColumn' });
  dispatcher.dispatch({ group: 'editor', action: 'undo' });
  dispatcher.dispatch({ group: 'paragraph', action: 'moveDown' });

  assert.deepEqual(calls, [
    ['outline', 14], ['format', 'formatBlock', 'h2'], ['insert', 'table'],
    ['table', 'deleteColumn'], ['editor', 'undo'], ['paragraph', 'moveDown']
  ]);
});

test('editor action dispatcher preserves asynchronous insert results', async () => {
  const result = Promise.resolve();
  const { dispatcher, calls } = createDispatcher({ insertResult: result });
  assert.equal(dispatcher.dispatch({ group: 'insert', action: 'link' }), result);
  await result;
  assert.deepEqual(calls, [['insert', 'link']]);
});

test('editor action dispatcher ignores commands until an editor is ready', () => {
  const { dispatcher, calls } = createDispatcher({ ready: false });
  dispatcher.dispatch({ group: 'outline', action: 'goto', position: 1 });
  dispatcher.dispatch({ group: 'insert', action: 'image' });
  assert.deepEqual(calls, []);
});
