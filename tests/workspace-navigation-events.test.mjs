import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceNavigationEvents } from '../src/features/navigation/workspace-navigation-events.ts';

function harness({ editing = false, changes = false, confirm = true } = {}) {
  const calls = [];
  const navigation = Object.fromEntries([
    'openHome', 'openDashboard', 'openBookmarks', 'openTrash', 'openNoteType',
    'filterHome', 'openNote', 'backFromNote'
  ].map(name => [name, (...args) => calls.push([name, ...args])]));
  const events = createWorkspaceNavigationEvents({
    navigation,
    isEditing: () => editing,
    editorHasChanges: () => changes,
    confirmLeaveEditor: async () => { calls.push(['confirm-leave']); return confirm; },
    addBookmark: () => calls.push(['add-bookmark']),
    openCreateMenu: () => calls.push(['open-create-menu']),
    createNew: type => calls.push(['create-new', type]),
    createFromMenu: kind => calls.push(['create-from-menu', kind]),
    createQuickImage: () => calls.push(['quick-image']),
    closeSearch: () => calls.push(['close-search'])
  });
  return { events, calls };
}

function click(targetSelectors, attributes = {}) {
  let prevented = false;
  return {
    event: {
      target: {
        closest(selector) {
          const options = selector.split(',').map(value => value.trim());
          return targetSelectors.some(value => options.includes(value)) ? {
            getAttribute(name) { return attributes[name] ?? null; }
          } : null;
        }
      },
      preventDefault() { prevented = true; }
    },
    wasPrevented: () => prevented
  };
}

test('navigation clicks ask before leaving changed editors and stop when canceled', async () => {
  const h = harness({ editing: true, changes: true, confirm: false });
  const event = click(['[data-trash-nav]']);
  assert.equal(await h.events.handle(event.event), true);
  assert.equal(event.wasPrevented(), true);
  assert.deepEqual(h.calls, [['confirm-leave']]);
});

test('navigation routes resolve note filters, notes, and home aliases through the navigation controller', async () => {
  const h = harness();
  assert.equal(await h.events.handle(click(['[data-type-nav]'], { 'data-type-nav': 'command' }).event), true);
  assert.equal(await h.events.handle(click(['[data-open]'], { 'data-open': 'note-1' }).event), true);
  assert.equal(await h.events.handle(click(['#mobileCats']).event), true);
  assert.deepEqual(h.calls, [
    ['openNoteType', 'command'],
    ['openNote', 'note-1'],
    ['openHome', 'all']
  ]);
});

test('global search note results use guarded navigation and close only after confirmation', async () => {
  const h = harness({ editing: true, changes: true, confirm: false });
  const result = click(['[data-search-id]'], { 'data-search-id': 'note-2' });

  assert.equal(await h.events.handle(result.event), true);
  assert.equal(result.wasPrevented(), true);
  assert.deepEqual(h.calls, [['confirm-leave']]);

  const accepted = harness({ editing: true, changes: true, confirm: true });
  assert.equal(await accepted.events.handle(click(['[data-search-id]'], { 'data-search-id': 'note-2' }).event), true);
  assert.deepEqual(accepted.calls, [['confirm-leave'], ['close-search'], ['openNote', 'note-2']]);
});

test('creation and return controls keep their feature actions behind navigation events', async () => {
  const h = harness();
  await h.events.handle(click(['[data-create-kind]'], { 'data-create-kind': 'capture' }).event);
  await h.events.handle(click(['[data-dashboard-add-bookmark]']).event);
  await h.events.handle(click(['#quickImage']).event);
  await h.events.handle(click(['#backDoc']).event);
  assert.deepEqual(h.calls, [
    ['create-from-menu', 'capture'],
    ['add-bookmark'],
    ['quick-image'],
    ['backFromNote']
  ]);
});

test('typed Vue navigation commands use the same unsaved-edit confirmation as compatibility clicks', async () => {
  const h = harness({ editing: true, changes: true, confirm: false });

  assert.equal(await h.events.execute({ type: 'open-note', id: 'note-2' }), true);
  assert.equal(await h.events.execute({ type: 'filter-home', typeFilter: 'command' }), true);
  assert.deepEqual(h.calls, [
    ['confirm-leave'],
    ['filterHome', 'command']
  ]);
});

test('typed Vue navigation commands call the feature controller without translating CSS selectors', () => {
  const h = harness();

  assert.equal(h.events.execute({ type: 'create-note', kind: 'command' }), true);
  assert.equal(h.events.execute({ type: 'back' }), true);
  assert.deepEqual(h.calls, [
    ['create-new', 'command'],
    ['backFromNote']
  ]);
});

test('opening the create menu stays in the editor until a creation action is chosen', async () => {
  const h = harness({ editing: true, changes: true });

  assert.equal(await h.events.execute({ type: 'open-create-menu' }), true);
  assert.equal(await h.events.handle(click(['#mobileNew']).event), true);
  assert.deepEqual(h.calls, [['open-create-menu'], ['open-create-menu']]);
});
