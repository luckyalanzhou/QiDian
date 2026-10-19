import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotePublishFlow } from '../src/features/editor/note-publish-flow.ts';

const draft = () => ({ id: 'note-1', title: '待发布', status: 'draft', body: '<p>内容</p>', updated: 1 });

function makeHarness(options = {}) {
  const events = [];
  const original = { notes: [options.note || draft()] };
  let editingDraft = options.editingDraft || original.notes[0];
  let editing = Boolean(options.editing);
  const flushResults = [...(options.flushResults || [true, true])];
  const dependencies = {
    getData: () => original,
    getNoteId: () => 'note-1',
    getEditingDraft: () => editingDraft,
    isEditing: () => editing,
    prepareEditor: () => events.push('prepare-editor'),
    saveDraft: () => events.push('save-draft'),
    isDraft: note => note.status === 'draft',
    hasDraftContent: note => !!note.title.trim() || !!note.body.replace(/<[^>]*>/g, '').trim(),
    needsPublish: note => note.status === 'draft' || !!note.publishedSnapshot,
    queueSave: data => events.push(['queue-save', structuredClone(data)]),
    flush: async () => { events.push('flush'); return flushResults.shift() ?? false; },
    complete: data => { events.push(['complete', structuredClone(data)]); },
    setBusy: busy => events.push(['busy', busy]),
    notify: message => events.push(['notify', message]),
    ...options.dependencies
  };
  return { flow: createNotePublishFlow(dependencies), events, original, setEditing: value => { editing = value; }, setEditingDraft: value => { editingDraft = value; } };
}

test('publishing an edit saves it first and only switches to published after the publish transaction succeeds', async () => {
  const harness = makeHarness({ editing: true });
  await harness.flow.publish();
  assert.deepEqual(harness.events.map(item => Array.isArray(item) ? item[0] : item), [
    ['busy', true][0], 'prepare-editor', 'save-draft', 'flush', 'queue-save', 'flush', 'complete', ['busy', false][0]
  ]);
  const queued = harness.events.find(item => Array.isArray(item) && item[0] === 'queue-save')[1];
  assert.equal(queued.notes[0].status, 'published');
  assert.equal(queued.notes[0].title, '待发布');
  assert.equal(harness.original.notes[0].status, 'draft', 'the page model is not marked published before commit');
});

test('an empty draft stays unpublished and does not queue a server write', async () => {
  const empty = { id: 'note-1', title: '', status: 'draft', body: '<p></p>', updated: 1 };
  const harness = makeHarness({ editing: true, note: empty, editingDraft: empty });
  await harness.flow.publish();
  assert.equal(harness.events.includes('flush'), false);
  assert.equal(harness.events.some(item => Array.isArray(item) && item[0] === 'queue-save'), false);
  assert.ok(harness.events.some(item => Array.isArray(item) && item[0] === 'notify' && /填写标题或正文/.test(item[1])));
});

test('a failed content save stops publication and retains the note for retry', async () => {
  const harness = makeHarness({ editing: true, flushResults: [false] });
  await harness.flow.publish();
  assert.equal(harness.events.some(item => Array.isArray(item) && item[0] === 'queue-save'), false);
  assert.equal(harness.events.some(item => Array.isArray(item) && item[0] === 'complete'), false);
  assert.ok(harness.events.some(item => Array.isArray(item) && item[0] === 'notify' && /内容仍保留/.test(item[1])));
});

test('a failed publish retries the same queued candidate without duplicating the write', async () => {
  const harness = makeHarness({ flushResults: [false, true] });
  await harness.flow.publish();
  await harness.flow.publish();
  assert.equal(harness.events.filter(item => Array.isArray(item) && item[0] === 'queue-save').length, 1);
  assert.equal(harness.events.filter(item => Array.isArray(item) && item[0] === 'complete').length, 1);
  assert.equal(harness.events.find(item => Array.isArray(item) && item[0] === 'complete')[1].notes[0].status, 'published');
});

test('repeated publish calls while the transaction is active do not duplicate the operation', async () => {
  let finishFlush;
  const harness = makeHarness({ dependencies: { flush: () => new Promise(resolve => { finishFlush = resolve; }) } });
  const first = harness.flow.publish();
  await new Promise(resolve => setTimeout(resolve, 0));
  const second = harness.flow.publish();
  finishFlush(true);
  await Promise.all([first, second]);
  assert.equal(harness.events.filter(item => Array.isArray(item) && item[0] === 'queue-save').length, 1);
});
