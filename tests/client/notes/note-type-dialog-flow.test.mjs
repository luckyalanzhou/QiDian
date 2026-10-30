import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoteTypeDialogFlow } from '../../../src/features/notes/type-dialog-flow.ts';

function harness({ failCommit = false } = {}) {
  const vault = {
    noteTypes: [{ id: 'note', name: '普通笔记' }, { id: 'command', name: '命令速查' }],
    notes: [{ id: 'n1', type: 'command', publishedSnapshot: { type: 'command' } }],
    trash: [{ id: 't1', kind: 'note', item: { id: 'n2', type: 'command', publishedSnapshot: { type: 'command' } } }]
  };
  let filter = 'command';
  const events = [];
  const flow = createNoteTypeDialogFlow({
    getVault: () => vault,
    mutateVault: operation => operation(vault),
    replaceVault: value => { vault.noteTypes = value.noteTypes; vault.notes = value.notes; vault.trash = value.trash; events.push('rollback'); },
    getTypeFilter: () => filter,
    setTypeFilter: value => { filter = value; },
    commit: async () => { events.push('commit'); if (failCommit) throw new Error('SQLite 提交失败'); },
    close: () => events.push('close'),
    render: () => events.push('render'),
    notify: message => events.push(`notify:${message}`)
  });
  return { vault, events, flow, getFilter: () => filter };
}

test('note type creation commits before closing and reports success', async () => {
  const h = harness();
  await h.flow.save({ mode: 'create', id: null, name: '读书笔记' });

  assert.equal(h.vault.noteTypes.at(-1).name, '读书笔记');
  assert.deepEqual(h.events, ['commit', 'close', 'render', 'notify:类型已创建；']);
});

test('deleting a note type migrates active and trashed notes before resolving the filter', async () => {
  const h = harness();
  await h.flow.save({ mode: 'delete', id: 'command', targetId: 'note' });

  assert.equal(h.vault.noteTypes.some(type => type.id === 'command'), false);
  assert.equal(h.vault.notes[0].type, 'note');
  assert.equal(h.vault.notes[0].publishedSnapshot.type, 'note');
  assert.equal(h.vault.trash[0].item.type, 'note');
  assert.equal(h.vault.trash[0].item.publishedSnapshot.type, 'note');
  assert.equal(h.getFilter(), 'all');
  assert.deepEqual(h.events, ['commit', 'close', 'render', 'notify:类型已删除，2 篇笔记已转移；']);
});

test('failed note type persistence restores the prior vault and filter', async () => {
  const h = harness({ failCommit: true });
  const before = structuredClone(h.vault);
  await h.flow.save({ mode: 'delete', id: 'command', targetId: 'note' });

  assert.deepEqual(h.vault, before);
  assert.equal(h.getFilter(), 'command');
  assert.deepEqual(h.events, ['commit', 'rollback', 'notify:SQLite 提交失败']);
});
