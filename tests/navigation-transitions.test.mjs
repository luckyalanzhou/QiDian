import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinia } from 'pinia';
import { backFromNote, filterHomeByType, resetWorkspaceHome, returnToHomePreservingList, toBookmarks, toDashboard, toHome, toNote, toNoteType, toTrash } from '../src/features/navigation/transitions.ts';
import { useNavigationStore } from '../src/features/navigation/store.ts';

const state = (overrides = {}) => ({
  page: 'home', active: 'recent', typeFilter: 'command', noteQuery: 'docker', noteId: 'old',
  editing: true, previewing: false, editingDraft: { title: '草稿' },
  noteReturn: null, ...overrides
});

test('Pinia owns the workspace route, filters, and editor context', () => {
  const navigation = useNavigationStore(createPinia());
  const route = state({
    page: 'note', active: 'pinned', typeFilter: 'command', noteQuery: 'router', noteId: 'note-1',
    editing: true, editingDraft: { id: 'note-1', title: '草稿' },
    noteReturn: { active: 'recent', typeFilter: 'issue', query: 'dns', scroll: 240 }
  });
  navigation.setWorkspaceState(route);
  assert.deepEqual(navigation.getWorkspaceState(), route);
  assert.deepEqual(structuredClone(navigation.editingDraft), route.editingDraft, 'editor draft remains cloneable by existing save and undo flows');
  navigation.noteQuery = 'sqlite';
  assert.equal(navigation.noteQuery, 'sqlite');
  assert.deepEqual(navigation.getWorkspaceState(), { ...route, noteQuery: 'sqlite' });
});

test('home and dashboard transitions reset filters and editor state intentionally', () => {
  const home = toHome(state(), '网络');
  assert.deepEqual([home.page, home.active, home.typeFilter, home.noteQuery, home.noteId], ['home', '网络', 'all', '', null]);
  assert.deepEqual([home.editing, home.previewing, home.editingDraft], [false, false, null]);
  const dashboard = toDashboard(state());
  assert.deepEqual([dashboard.page, dashboard.active, dashboard.noteId], ['dashboard', 'all', null]);
  assert.equal(dashboard.typeFilter, 'all');
});

test('bookmark and trash transitions leave note context intact while clearing the active editor', () => {
  const source = state({ active: 'pinned', noteReturn: { active: 'recent', typeFilter: 'note', query: '', scroll: 320 } });
  for (const next of [toBookmarks(source), toTrash(source)]) {
    assert.equal(next.noteId, null);
    assert.equal(next.editing, false);
    assert.equal(next.active, 'pinned');
    assert.deepEqual(next.noteReturn, source.noteReturn);
  }
});

test('note type navigation resets the list scope while an in-list filter preserves it', () => {
  const source = state({ page: 'note', active: 'pinned', typeFilter: 'old-type', noteId: 'note-1', editing: true });
  const route = toNoteType(source, 'command');
  assert.deepEqual([route.page, route.active, route.typeFilter, route.noteId, route.editing], ['home', 'all', 'command', null, false]);
  assert.equal(route.noteReturn, source.noteReturn);

  const filterState = state({ page: 'home', active: 'recent', typeFilter: 'all', noteQuery: 'router' });
  assert.deepEqual(filterHomeByType(filterState, 'command'), { ...filterState, typeFilter: 'command' });
});

test('workspace replacement clears stale note context while history restore preserves list scope', () => {
  const source = state({ page: 'note', active: 'pinned', typeFilter: 'command', noteQuery: 'router', noteId: 'note-1', noteReturn: { active: 'recent', typeFilter: 'issue', query: 'dns', scroll: 80 } });
  const reset = resetWorkspaceHome(source);
  assert.deepEqual([reset.page, reset.active, reset.typeFilter, reset.noteQuery, reset.noteId, reset.noteReturn], ['home', 'all', 'all', '', null, null]);

  const returned = returnToHomePreservingList(source);
  assert.deepEqual([returned.page, returned.active, returned.typeFilter, returned.noteQuery, returned.noteId], ['home', 'pinned', 'command', 'router', null]);
  assert.equal(returned.noteReturn, source.noteReturn);
});

test('opening a note remembers the home list and opening an invalid note preserves only that route change', () => {
  const source = state({ page: 'home', editing: false, active: 'drafts', typeFilter: 'issue', noteQuery: '密码' });
  const opened = toNote(source, { id: 'note-1', exists: true, isDraft: true, scroll: 640 });
  assert.equal(opened.state.page, 'note');
  assert.deepEqual(opened.state.noteReturn, { active: 'drafts', typeFilter: 'issue', query: '密码', scroll: 640 });
  assert.equal(opened.state.previewing, true);
  assert.equal(opened.scrollTo, 0);

  const missing = toNote(source, { id: 'missing', exists: false, scroll: 640 });
  assert.equal(missing.found, false);
  assert.equal(missing.state.page, 'home');
  assert.equal(missing.state.noteId, 'old');
  assert.equal(missing.state.noteReturn.scroll, 640);
});

test('back from an edited note returns to reading, then restores its list state and scroll', () => {
  const edited = backFromNote(state({ page: 'note', editing: true, noteId: 'note-1' }));
  assert.equal(edited.mode, 'reader');
  assert.equal(edited.state.editing, false);
  assert.equal(edited.state.previewing, true);

  const restored = backFromNote(state({ page: 'note', editing: false, noteId: 'note-1', noteReturn: { active: 'pinned', typeFilter: 'command', query: 'shell', scroll: 912 } }));
  assert.equal(restored.mode, 'restore-list');
  assert.deepEqual([restored.state.page, restored.state.active, restored.state.typeFilter, restored.state.noteQuery], ['home', 'pinned', 'command', 'shell']);
  assert.equal(restored.scrollTo, 912);
});

test('back from a note without a remembered list returns to the current home view', () => {
  const result = backFromNote(state({ page: 'note', editing: false, active: 'recent', noteReturn: null }));
  assert.equal(result.mode, 'home');
  assert.equal(result.state.page, 'home');
  assert.equal(result.state.active, 'recent');
  assert.equal(result.state.noteQuery, '');
});
