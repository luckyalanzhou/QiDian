import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditorAutosaveController } from '../../../src/features/editor/autosave-controller.ts';

function harness() {
  let nextId = 0;
  const timers = new Map();
  const saves = [];
  const state = { editing: true, hasDraft: true };
  const autosave = createEditorAutosaveController({
    isEditing: () => state.editing,
    hasEditingDraft: () => state.hasDraft,
    saveDraft: () => { saves.push('save'); return true; },
    setTimer: callback => { const id = ++nextId; timers.set(id, callback); return id; },
    clearTimer: id => timers.delete(id)
  });
  return { autosave, timers, saves, state };
}

test('autosave replaces the pending timer and saves once after the latest edit', () => {
  const h = harness();
  h.autosave.schedule();
  const firstId = h.timers.keys().next().value;
  h.autosave.schedule();

  assert.equal(h.timers.has(firstId), false);
  assert.equal(h.timers.size, 1);
  assert.equal(h.autosave.isScheduled(), true);
  [...h.timers.values()][0]();
  assert.deepEqual(h.saves, ['save']);
  assert.equal(h.autosave.isScheduled(), false);
});

test('flush cancels the pending timer and saves only while an editing draft exists', () => {
  const h = harness();
  h.autosave.schedule();
  assert.equal(h.autosave.flush(), true);
  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.saves, ['save']);
  assert.equal(h.autosave.flush(), false, 'there is no second pending save to flush');

  h.autosave.schedule();
  h.state.editing = false;
  assert.equal(h.autosave.flush(), false);
  assert.equal(h.autosave.isScheduled(), true, 'a non-editing flush leaves timer ownership unchanged');
  h.autosave.clear();
  assert.equal(h.timers.size, 0);
});

test('clear is safe before scheduling and can cancel pending work repeatedly', () => {
  const h = harness();
  h.autosave.clear();
  h.autosave.schedule();
  h.autosave.clear();
  h.autosave.clear();

  assert.equal(h.timers.size, 0);
  assert.deepEqual(h.saves, []);
});
