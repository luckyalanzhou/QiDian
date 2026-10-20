import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceViewDispatcher } from '../src/features/navigation/workspace-view-dispatcher.ts';

function harness({ page = 'dashboard', editing = false, vueMounted = true } = {}) {
  const events = [];
  let state = { page, editing };
  const main = { hidden: false };
  const host = {
    hidden: true,
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; }
  };
  const callback = name => () => events.push(name);
  const dispatcher = createWorkspaceViewDispatcher({
    getState: () => state,
    vueMounted,
    main,
    getVueHost: () => host,
    pruneExpiredTrash: callback('prune'),
    leaveBookmarks: callback('leave-bookmarks'),
    disconnectReaderHeadingObserver: callback('disconnect-reader'),
    renderSidebar: callback('sidebar'),
    destroyRichEditor: callback('destroy-editor'),
    setBreadcrumb: value => events.push(`breadcrumb:${value}`),
    prepareVueEditorPage: callback('vue-editor'),
    renderLegacyBookmarks: callback('legacy-bookmarks'),
    renderLegacyTrash: callback('legacy-trash'),
    renderLegacyDashboard: callback('legacy-dashboard'),
    renderLegacyHome: callback('legacy-home'),
    renderLegacyEditor: callback('legacy-editor'),
    renderLegacyReader: callback('legacy-reader')
  });
  return { dispatcher, events, main, host, setState: next => { state = next; } };
}

test('Vue workspace dispatch updates the shell and routes the active note to its page', () => {
  const h = harness({ page: 'note', vueMounted: true });
  h.dispatcher.render();

  assert.equal(h.main.hidden, true);
  assert.equal(h.host.hidden, false);
  assert.equal(h.host.attributes['aria-label'], '阅读笔记');
  assert.deepEqual(h.events, ['prune', 'disconnect-reader', 'sidebar']);
});

test('Vue editor dispatch labels and prepares the editing page without legacy rendering', () => {
  const h = harness({ page: 'note', editing: true });
  h.dispatcher.render();

  assert.equal(h.host.attributes['aria-label'], '编辑笔记');
  assert.equal(h.events.at(-1), 'vue-editor');
  assert.equal(h.events.some(event => event.startsWith('legacy-')), false);
});

test('Vue bookmark dispatch relies on reactive page state instead of a manual rerender callback', () => {
  const h = harness({ page: 'bookmarks', vueMounted: true });
  h.dispatcher.render();

  assert.equal(h.main.hidden, true);
  assert.equal(h.host.hidden, false);
  assert.equal(h.host.attributes['aria-label'], '书签');
  assert.equal(h.events.includes('legacy-bookmarks'), false);
  assert.deepEqual(h.events, ['prune', 'disconnect-reader', 'sidebar', 'destroy-editor']);
});

test('legacy fallback renders the matching page and hides the Vue host', () => {
  const h = harness({ page: 'note', editing: true, vueMounted: false });
  h.dispatcher.render();

  assert.equal(h.main.hidden, false);
  assert.equal(h.host.hidden, true);
  assert.equal(h.events.at(-1), 'legacy-editor');
});

test('leaving bookmarks runs its cleanup before dispatching another page', () => {
  const h = harness({ page: 'bookmarks', vueMounted: false });
  h.dispatcher.render();
  h.setState({ page: 'trash', editing: false });
  const transitionStart = h.events.length;
  h.dispatcher.render();

  assert.deepEqual(h.events.slice(transitionStart, transitionStart + 3), ['prune', 'leave-bookmarks', 'disconnect-reader']);
  assert.equal(h.events.at(-1), 'legacy-trash');
});
