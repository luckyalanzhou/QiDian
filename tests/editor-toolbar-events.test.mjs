import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorToolbarEvents } from '../src/features/editor/toolbar-events.ts';

function harness() {
  const calls = [];
  const controller = createEditorToolbarEvents({
    closeSlashMenu: () => calls.push(['close-slash']),
    format: (...args) => calls.push(['format', ...args]),
    insert: kind => { calls.push(['insert', kind]); },
    tableAction: action => calls.push(['table', action])
  });
  return { controller, calls };
}

function target(selector, value = '') {
  return {
    closest(query) {
      return query.split(',').map(item => item.trim()).includes(selector)
        ? { getAttribute: name => name === 'data-slash' ? value : name === 'data-fmt' ? value : name === 'data-insert' ? value : name === 'data-table-action' ? value : null, value }
        : null;
    }
  };
}

test('toolbar commands route formatting, insertion and table changes to editor controllers', async () => {
  const h = harness();
  assert.equal(h.controller.handleClick(target('[data-fmt]', 'bold')), true);
  assert.equal(await h.controller.handleClick(target('[data-insert]', 'table')), true);
  assert.equal(h.controller.handleClick(target('[data-table-action]', 'addRowAfter')), true);
  assert.deepEqual(h.calls, [['format', 'bold'], ['insert', 'table'], ['table', 'addRowAfter']]);
});

test('slash-menu shortcuts close the menu before formatting or inserting', async () => {
  const h = harness();
  assert.equal(h.controller.handleClick(target('[data-slash]', 'h2')), true);
  assert.equal(await h.controller.handleClick(target('[data-slash]', 'link')), true);
  assert.deepEqual(h.calls, [['close-slash'], ['format', 'formatBlock', 'h2'], ['close-slash'], ['insert', 'link']]);
});

test('paragraph and color selectors share the editor format command boundary', () => {
  const h = harness();
  assert.equal(h.controller.handleChange(target('#blockSelect', 'blockquote')), true);
  assert.equal(h.controller.handleChange(target('#fontColor', '#5261cf')), true);
  assert.deepEqual(h.calls, [['format', 'formatBlock', 'blockquote'], ['format', 'foreColor', '#5261cf']]);
});
