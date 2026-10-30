import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorPagePreparation } from '../../../src/features/editor/page-preparation.ts';

test('editor page preparation follows teardown, draft, options and session sync order', () => {
  const events = [];
  const note = { id: 'note-1' };
  const session = { noteId: 'note-1', pasteMode: 'markdown' };
  const preparation = createEditorPagePreparation({
    destroyEditor: () => events.push('destroy'),
    ensureDraft: () => { events.push('draft'); return note; },
    getOptions: () => { events.push('options'); return { noteTypes: [{ id: 'note' }], categories: ['开发'] }; },
    getPasteMode: () => { events.push('paste-mode'); return 'markdown'; },
    createSession: input => { events.push(['session', input]); return session; },
    sync: value => events.push(['sync', value])
  });

  preparation.prepare();

  assert.deepEqual(events, [
    'destroy',
    'draft',
    'options',
    'paste-mode',
    ['session', { note, noteTypes: [{ id: 'note' }], categories: ['开发'], pasteMode: 'markdown' }],
    ['sync', session]
  ]);
});

test('editor page preparation does not sync a partial session when restoring the draft fails', () => {
  const events = [];
  const preparation = createEditorPagePreparation({
    destroyEditor: () => events.push('destroy'),
    ensureDraft: () => { events.push('draft'); throw new Error('note missing'); },
    getOptions: () => { events.push('options'); return { noteTypes: [], categories: [] }; },
    getPasteMode: () => 'rich',
    createSession: input => input,
    sync: session => events.push(['sync', session])
  });

  assert.throws(() => preparation.prepare(), /note missing/);
  assert.deepEqual(events, ['destroy', 'draft']);
});
