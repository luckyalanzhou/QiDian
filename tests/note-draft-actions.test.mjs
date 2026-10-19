import test from 'node:test';
import assert from 'node:assert/strict';
import { saveNoteDraft } from '../src/features/notes/draft-actions.ts';

function note(overrides = {}) {
  return {
    id: 'draft-1', title: '', type: 'note', category: '开发', tags: [], body: '', source: '',
    created: 1, updated: 2, pinned: false, status: 'draft', ...overrides
  };
}

function vault(notes = []) {
  return { categories: [], notes };
}

test('an empty transient draft is discarded without requesting persistence', () => {
  const current = note();
  const data = vault([current]);
  const result = saveNoteDraft(data, current, {
    transient: true, unchangedNew: false, isDraft: item => item.status === 'draft', hasContent: () => false
  });

  assert.deepEqual(result, { shouldPersist: false, retained: false });
  assert.deepEqual(data.notes, []);
});

test('an existing draft cleared by the user is removed and persisted', () => {
  const current = note({ id: 'saved-draft' });
  const data = vault([current]);
  const result = saveNoteDraft(data, current, {
    transient: false, unchangedNew: false, isDraft: item => item.status === 'draft', hasContent: () => false
  });

  assert.deepEqual(result, { shouldPersist: true, retained: false });
  assert.deepEqual(data.notes, []);
});

test('saving draft content stores a detached note, supplies a title and adds its category', () => {
  const current = note({ body: '<p>实际内容</p>' });
  const data = vault([current]);
  const result = saveNoteDraft(data, current, {
    transient: true, unchangedNew: false, isDraft: item => item.status === 'draft', hasContent: () => true
  });

  assert.deepEqual(result, { shouldPersist: true, retained: true });
  assert.equal(data.notes[0].title, '无标题笔记');
  assert.notStrictEqual(data.notes[0], current);
  assert.deepEqual(data.categories, ['开发']);
  assert.equal(current.title, '');
});

test('saving a published note keeps it even when the content checker returns false', () => {
  const current = note({ status: 'published', title: '旧笔记' });
  const data = vault([current]);
  const result = saveNoteDraft(data, current, {
    transient: false, unchangedNew: false, isDraft: item => item.status === 'draft', hasContent: () => false
  });

  assert.deepEqual(result, { shouldPersist: true, retained: true });
  assert.equal(data.notes[0].title, '旧笔记');
  assert.equal(data.notes[0].status, 'published');
});
