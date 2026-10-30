import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorHtmlInserter } from '../../../src/features/editor/html-inserter.ts';

function fakeEditor(events) {
  return {
    chain() {
      events.push('chain');
      return {
        focus() {
          events.push('focus');
          return this;
        },
        insertContent(html, options) {
          events.push(['insert', html, options]);
          return this;
        },
        run() {
          events.push('run');
        }
      };
    }
  };
}

test('editor HTML insertion sanitizes content, preserves whitespace and syncs the draft after applying it', () => {
  const events = [];
  const inserter = createEditorHtmlInserter({
    getEditor: () => fakeEditor(events),
    sanitize: html => { events.push(['sanitize', html]); return '<p>safe\ncontent</p>'; },
    afterInsert: () => events.push('sync-draft-and-autosave')
  });

  inserter.insert('<script>unsafe()</script><p>safe\ncontent</p>');

  assert.deepEqual(events, [
    'chain',
    'focus',
    ['sanitize', '<script>unsafe()</script><p>safe\ncontent</p>'],
    ['insert', '<p>safe\ncontent</p>', { parseOptions: { preserveWhitespace: 'full' } }],
    'run',
    'sync-draft-and-autosave'
  ]);
});

test('editor HTML insertion is inert when the editor has not mounted', () => {
  const events = [];
  const inserter = createEditorHtmlInserter({
    getEditor: () => null,
    sanitize: html => { events.push(['sanitize', html]); return html; },
    afterInsert: () => events.push('sync-draft-and-autosave')
  });

  inserter.insert('<p>content</p>');
  assert.deepEqual(events, []);
});

test('editor HTML insertion does not mark a draft changed when the editor command fails', () => {
  const events = [];
  const editor = fakeEditor(events);
  editor.chain = () => ({
    focus() { return this; },
    insertContent() { return this; },
    run() { throw new Error('editor command failed'); }
  });
  const inserter = createEditorHtmlInserter({
    getEditor: () => editor,
    sanitize: html => html,
    afterInsert: () => events.push('sync-draft-and-autosave')
  });

  assert.throws(() => inserter.insert('<p>content</p>'), /editor command failed/);
  assert.deepEqual(events, []);
});
