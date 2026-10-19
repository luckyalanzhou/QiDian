import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPinia } from 'pinia';
import { useEditorStore } from '../src/features/editor/store.ts';
import { useNavigationStore } from '../src/features/navigation/store.ts';
import { useVaultStore } from '../src/features/vault/store.ts';

test('editor store owns note projection and dispatches typed runtime actions', () => {
  const pinia = createPinia();
  const editor = useEditorStore(pinia);
  const navigation = useNavigationStore(pinia);
  const vault = useVaultStore(pinia);
  vault.replace({ notes: [] });
  navigation.page = 'note';
  navigation.noteId = 'note-1';
  navigation.editing = true;
  const events = [];
  editor.bindRuntime({
    initialize: () => events.push('initialize'),
    dispatch: action => events.push(action)
  });

  const snapshot = {
    noteId: 'note-1', title: '标题', type: 'note', category: '开发', tags: 'Linux', source: '',
    noteTypes: [{ id: 'note', label: '普通笔记' }], categories: ['开发'],
    publishLabel: '发布笔记', pasteMode: 'rich', revision: 0
  };
  editor.sync(snapshot);

  assert.equal(editor.active, true);
  assert.equal(editor.snapshot.noteId, 'note-1');
  assert.equal(editor.snapshot.revision, 1);
  assert.deepEqual(editor.form, { title: '标题', type: 'note', category: '开发', tags: 'Linux', source: '' });
  editor.form.title = '更新标题';
  assert.equal(editor.form.title, '更新标题', 'editable metadata belongs to the Pinia form state');
  editor.initialize();
  editor.dispatch({ group: 'table', action: 'addRowAfter' });
  assert.deepEqual(events, ['initialize', { group: 'table', action: 'addRowAfter' }]);

  editor.showSlashMenu({ left: 32, top: 64 });
  assert.deepEqual(editor.slashMenu, { visible: true, left: 32, top: 64 });
  editor.closeSlashMenu();
  assert.equal(editor.slashMenu.visible, false, 'the slash menu is controlled by editor state');

  navigation.editing = false;
  assert.equal(editor.active, false);
});
