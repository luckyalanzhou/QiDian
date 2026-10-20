import test from 'node:test';
import assert from 'node:assert/strict';
import { createVaultPersistence } from '../../../src/features/vault/persistence.ts';

function harness({ id = 'draft-1', body = '', draft = true, unsavedId = 'draft-1' } = {}) {
  const vault = { notes: [{ id, body, draft }], categories: [] };
  const queued = [];
  const committed = [];
  const persistence = createVaultPersistence({
    getVault: () => vault,
    getUnsavedNewNoteId: () => unsavedId,
    isDraft: note => note.draft,
    hasDraftContent: note => Boolean(note.body.trim()),
    queueSave: candidate => queued.push(candidate),
    commitSave: async candidate => { committed.push(candidate); }
  });
  return { vault, queued, committed, persistence };
}

test('blank unsaved drafts are omitted from the queued snapshot without mutating the active vault', () => {
  const h = harness();

  assert.equal(h.persistence.persist(), true);
  assert.equal(h.queued.length, 1);
  assert.notEqual(h.queued[0], h.vault);
  assert.deepEqual(h.queued[0].notes, []);
  assert.equal(h.vault.notes.length, 1);
});

test('drafts with content and published notes remain in the queued snapshot', () => {
  const withContent = harness({ body: '<p>Written content</p>' });
  withContent.persistence.persist();
  assert.equal(withContent.queued[0], withContent.vault);

  const published = harness({ draft: false });
  published.persistence.persist();
  assert.equal(published.queued[0], published.vault);
});

test('immediate persistence resolves only after the SQLite commit adapter succeeds', async () => {
  const h = harness();
  let finishCommit;
  const candidate = structuredClone(h.vault);
  const persistence = createVaultPersistence({
    getVault: () => h.vault,
    getUnsavedNewNoteId: () => null,
    isDraft: note => note.draft,
    hasDraftContent: note => Boolean(note.body),
    queueSave: value => h.queued.push(value),
    commitSave: value => {
      h.committed.push(value);
      return new Promise(resolve => { finishCommit = resolve; });
    }
  });

  let resolved = false;
  const saving = persistence.commitPersist(candidate).then(value => { resolved = true; return value; });
  await Promise.resolve();
  assert.equal(resolved, false);
  assert.equal(h.committed[0], candidate);

  finishCommit();
  assert.equal(await saving, true);
  assert.equal(resolved, true);
});
