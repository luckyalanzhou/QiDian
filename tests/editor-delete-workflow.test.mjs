import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorDeleteWorkflow } from '../src/features/notes/editor-delete-workflow.ts';

function harness(options = {}) {
  const events = [];
  let vault = { notes: options.exists === false ? [] : [{ id: 'n1', title: '已有笔记', body: '<p>旧内容</p>' }] };
  let draft = Object.hasOwn(options, 'draft') ? options.draft : { id: 'n1', title: '编辑中的笔记', body: '<p>旧内容</p>', status: 'draft' };
  const workflow = createEditorDeleteWorkflow({
    getVault: () => vault,
    getNoteId: () => options.noteId === null ? null : 'n1',
    getEditingDraft: () => draft,
    prepareEditingDraft: () => { events.push('prepare-draft'); if (draft && !options.keepBody) draft.body = '<p>尚未提交的修改</p>'; },
    isTransientNewNote: () => !!options.transient,
    isDraft: note => note.status === 'draft',
    hasDraftContent: note => Boolean(note.body?.replace(/<[^>]+>/g, '').trim()),
    confirm: async (message, config) => { events.push(['confirm', message, config]); return options.confirmed ?? true; },
    clearAutosave: () => events.push('clear-autosave'),
    discardDetachedNote: id => { events.push(`discard:${id}`); vault.notes = vault.notes.filter(note => note.id !== id); },
    storeEditingDraft: note => events.push(['store-draft', structuredClone(note)]),
    moveToTrash: async id => { events.push(`move:${id}`); return options.moveResult ?? true; },
    clearTransientState: () => events.push('clear-transient'),
    closeEditor: () => events.push('close-editor'),
    openHome: () => events.push('open-home')
  });
  return { workflow, events };
}

test('deleting a transient new note asks to discard it without entering the recycle bin', async () => {
  const h = harness({ transient: true, exists: false });
  assert.equal(await h.workflow.removeCurrentNote(), true);
  assert.deepEqual(h.events, [
    'prepare-draft',
    ['confirm', '放弃这篇尚未保存的新笔记？', { title: '放弃笔记', confirmText: '放弃笔记', danger: true }],
    'clear-autosave', 'discard:n1', 'clear-transient', 'close-editor', 'open-home'
  ]);
});

test('deleting a saved note stages the current editor draft before the transactional recycle-bin move', async () => {
  const h = harness();
  assert.equal(await h.workflow.removeCurrentNote(), true);
  const stored = h.events.find(event => Array.isArray(event) && event[0] === 'store-draft');
  assert.equal(stored[1].body, '<p>尚未提交的修改</p>');
  assert.ok(h.events.indexOf('clear-autosave') < h.events.findIndex(event => Array.isArray(event) && event[0] === 'store-draft'));
  assert.ok(h.events.indexOf(`move:n1`) < h.events.indexOf('close-editor'));
});

test('canceling a note deletion leaves editing and autosave state untouched', async () => {
  const h = harness({ confirmed: false });
  assert.equal(await h.workflow.removeCurrentNote(), false);
  assert.equal(h.events.some(event => event === 'clear-autosave' || event === 'move:n1' || event === 'close-editor'), false);
});

test('an empty detached draft is discarded instead of being moved to trash', async () => {
  const h = harness({ exists: false, keepBody: true, draft: { id: 'n1', title: '', body: '<p></p>', status: 'draft' } });
  assert.equal(await h.workflow.removeCurrentNote(), true);
  assert.ok(h.events.some(event => Array.isArray(event) && event[0] === 'confirm' && event[1].includes('不会进入回收站')));
  assert.equal(h.events.includes('move:n1'), false);
  assert.equal(h.events.includes('discard:n1'), true);
});

test('a rejected recycle-bin transaction keeps the editor open for retry', async () => {
  const h = harness({ moveResult: false });
  assert.equal(await h.workflow.removeCurrentNote(), false);
  assert.equal(h.events.includes('close-editor'), false);
  assert.equal(h.events.includes('open-home'), false);
});
