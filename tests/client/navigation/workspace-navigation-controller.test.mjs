import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceNavigationController } from '../../../src/features/navigation/workspace-navigation-controller.ts';

function harness(overrides = {}) {
  let state = {
    page: 'home', active: 'recent', typeFilter: 'command', noteQuery: 'router', noteId: 'previous',
    editing: true, previewing: false, editingDraft: { title: '草稿' }, noteReturn: null
  };
  const events = [];
  const controller = createWorkspaceNavigationController({
    getState: () => state,
    setState: next => { state = next; events.push(['state', next.page, next.noteId]); },
    findNote: id => id === 'note-1' ? { id, status: 'draft' } : undefined,
    isDraft: note => note.status === 'draft',
    saveDraft: () => events.push(['save-draft']),
    clearAutoSave: () => events.push(['clear-auto-save']),
    closeMenu: () => events.push(['close-menu']),
    render: () => events.push(['render']),
    getScrollY: () => 360,
    scrollTo: position => events.push(['scroll', position]),
    openBookmarkFolder: id => events.push(['open-folder', id]),
    resumeBookmarks: () => events.push(['resume-bookmarks']),
    ...overrides
  });
  return { controller, events, getState: () => state, setState: value => { state = value; } };
}

test('home navigation saves first, resets route state, and applies the view side effects in order', () => {
  const h = harness();
  h.controller.openHome('开发');
  assert.deepEqual(h.events.map(event => event[0]), ['save-draft', 'clear-auto-save', 'state', 'close-menu', 'render', 'scroll']);
  assert.deepEqual([h.getState().page, h.getState().active, h.getState().typeFilter, h.getState().noteId], ['home', '开发', 'all', null]);
});

test('bookmark navigation renders the route before restoring or opening a folder', () => {
  const h = harness();
  h.controller.openBookmarks('folder-1');
  assert.deepEqual(h.events.slice(-5).map(event => event[0]), ['state', 'close-menu', 'render', 'scroll', 'open-folder']);
  assert.equal(h.getState().page, 'bookmarks');
  const root = harness();
  root.controller.openBookmarks();
  assert.equal(root.events.at(-1)[0], 'resume-bookmarks');
});

test('note type navigation saves the editor before switching route and local filtering avoids navigation side effects', () => {
  const h = harness();
  h.controller.openNoteType('command');
  assert.deepEqual(h.events.map(event => event[0]), ['save-draft', 'clear-auto-save', 'state', 'close-menu', 'render', 'scroll']);
  assert.deepEqual([h.getState().page, h.getState().active, h.getState().typeFilter, h.getState().noteId], ['home', 'all', 'command', null]);

  const filter = harness();
  filter.setState({ ...filter.getState(), page: 'home', active: 'recent', editing: false });
  filter.controller.filterHome('issue');
  assert.deepEqual([filter.getState().page, filter.getState().active, filter.getState().typeFilter], ['home', 'recent', 'issue']);
  assert.deepEqual(filter.events.map(event => event[0]), ['state', 'render', 'scroll']);
});

test('workspace reset clears stale filters, while returning after history restore preserves them', () => {
  const reset = harness();
  reset.controller.resetHome();
  assert.deepEqual([reset.getState().page, reset.getState().active, reset.getState().typeFilter, reset.getState().noteQuery, reset.getState().noteReturn], ['home', 'all', 'all', '', null]);
  assert.deepEqual(reset.events.map(event => event[0]), ['clear-auto-save', 'state', 'close-menu', 'render', 'scroll']);

  const restored = harness();
  restored.controller.returnHomePreservingList();
  assert.deepEqual([restored.getState().page, restored.getState().active, restored.getState().typeFilter, restored.getState().noteQuery], ['home', 'recent', 'command', 'router']);
  assert.deepEqual(restored.events.map(event => event[0]), ['clear-auto-save', 'state', 'close-menu', 'render', 'scroll']);
});

test('opening a draft note records the return context before resolving the note', () => {
  const h = harness();
  assert.equal(h.controller.openNote('note-1', true), true);
  assert.deepEqual(h.getState().noteReturn, { active: 'recent', typeFilter: 'command', query: 'router', scroll: 360 });
  assert.deepEqual([h.getState().page, h.getState().noteId, h.getState().editing, h.getState().previewing], ['note', 'note-1', true, true]);
  assert.deepEqual(h.events.map(event => event[0]), ['state', 'save-draft', 'state', 'close-menu', 'render', 'scroll']);
});

test('an unknown note updates no page and does not run rendering effects', () => {
  const h = harness();
  assert.equal(h.controller.openNote('missing'), false);
  assert.equal(h.getState().page, 'home');
  assert.deepEqual(h.events.map(event => event[0]), ['state', 'save-draft']);
});

test('returning from reader does not close menus, while returning from an editor saves first', () => {
  const h = harness();
  h.setState({ ...h.getState(), page:'note', editing:false, noteReturn:{ active:'pinned', typeFilter:'issue', query:'ssh', scroll:720 } });
  h.controller.backFromNote();
  assert.deepEqual([h.getState().page, h.getState().active, h.getState().noteQuery], ['home', 'pinned', 'ssh']);
  assert.deepEqual(h.events.slice(-3).map(event => event[0]), ['state', 'render', 'scroll']);
  assert.equal(h.events.some(event => event[0] === 'close-menu'), false);

  const editing = harness();
  editing.setState({ ...editing.getState(), page:'note', editing:true });
  editing.controller.backFromNote();
  assert.equal(editing.getState().editing, false);
  assert.deepEqual(editing.events.map(event => event[0]), ['save-draft', 'state', 'render', 'scroll']);
});

test('returning from a reader restores focus to the note card after rendering the preserved list', () => {
  const focusedNotes = [];
  const timeline = [];
  const h = harness({
    render: () => timeline.push('render'),
    scrollTo: () => timeline.push('scroll'),
    restoreNoteFocus: id => { focusedNotes.push(id); timeline.push('restore-note-focus'); }
  });
  h.setState({
    ...h.getState(),
    page: 'note',
    noteId: 'note-1',
    editing: false,
    noteReturn: { active:'recent', typeFilter:'all', query:'router', scroll:360 }
  });

  h.controller.backFromNote();

  assert.deepEqual([h.getState().page, h.getState().noteQuery], ['home', 'router']);
  assert.deepEqual(focusedNotes, ['note-1']);
  assert.deepEqual(timeline, ['render', 'scroll', 'restore-note-focus']);
});
