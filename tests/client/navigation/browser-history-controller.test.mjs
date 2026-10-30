import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserHistoryController } from '../../../src/features/navigation/browser-history-controller.ts';

function createBrowser(url = 'https://qidian.test/') {
  const listeners = new Map();
  const entries = [{ url, state: null }];
  let cursor = 0;
  const location = { get href() { return entries[cursor].url; } };
  const history = {
    get state() { return entries[cursor].state; },
    pushState(state, _title, nextUrl) {
      entries.splice(cursor + 1);
      entries.push({ url: new URL(nextUrl, location.href).href, state });
      cursor += 1;
    },
    replaceState(state, _title, nextUrl) {
      entries[cursor] = { url: new URL(nextUrl, location.href).href, state };
    },
    go(delta) {
      const next = Math.max(0, Math.min(entries.length - 1, cursor + delta));
      if (next === cursor) return;
      cursor = next;
      for (const listener of listeners.get('popstate') || []) listener({ state: history.state });
    },
    back() { history.go(-1); },
    forward() { history.go(1); }
  };
  const window = {
    history,
    location,
    scrollY: 0,
    addEventListener(name, listener) {
      const bucket = listeners.get(name) || new Set();
      bucket.add(listener);
      listeners.set(name, bucket);
    },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    requestAnimationFrame(callback) { callback(); return 1; },
    scrollTo({ top }) { window.scrollY = top; }
  };
  return { window, entries, get cursor() { return cursor; } };
}

const baseNavigation = () => ({
  page: 'dashboard', active: 'all', typeFilter: 'all', noteQuery: '', noteId: null,
  editing: false, previewing: false, editingDraft: null, noteReturn: null
});

function createHarness(url, allowLeave = true, saveResult = true) {
  const browser = createBrowser(url);
  let navigation = baseNavigation();
  let dialog = null;
  const restored = [];
  const invalid = [];
  const prompts = [];
  const events = [];
  const history = createBrowserHistoryController({
    window: browser.window,
    getNavigation: () => navigation,
    restoreNavigation: (state, scrollY) => {
      if (state.page === 'note' && state.noteId === 'missing') {
        navigation = { ...baseNavigation(), page: 'dashboard' };
        return false;
      }
      navigation = { ...state, editingDraft: null };
      restored.push({ navigation, scrollY });
      events.push('restore');
      return true;
    },
    restoreDialog: next => { dialog = next; },
    hasUnsavedEditorChanges: () => true,
    saveEditorBeforeLeaving: async () => {
      prompts.push('save-before-leave');
      events.push('save-start');
      await Promise.resolve();
      events.push('save-complete');
      return saveResult;
    },
    confirmLeaveEditor: async () => { prompts.push('confirm'); events.push('confirm'); return allowLeave; },
    onInvalidRoute: () => invalid.push('invalid')
  });
  return {
    ...browser,
    history,
    getNavigation: () => navigation,
    getDialog: () => dialog,
    restored,
    invalid,
    prompts,
    events,
    setNavigation: next => { navigation = next; }
  };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

test('start restores a directly linked note after the application has loaded', async () => {
  const h = createHarness('https://qidian.test/?qidian=note&note=note-1');
  h.history.start();
  await settle();

  assert.equal(h.getNavigation().page, 'note');
  assert.equal(h.getNavigation().noteId, 'note-1');
  assert.equal(new URL(h.window.location.href).searchParams.get('qidian'), 'note');
  assert.equal(h.restored.at(-1).navigation.editingDraft, null);
});

test('unknown or deleted direct-note targets fall back and replace the bad address', async () => {
  const h = createHarness('https://qidian.test/?qidian=note&note=missing');
  h.history.start();
  await settle();

  assert.equal(h.getNavigation().page, 'dashboard');
  assert.deepEqual(h.invalid, ['invalid']);
  assert.equal(new URL(h.window.location.href).searchParams.get('qidian'), 'dashboard');
  assert.equal(new URL(h.window.location.href).searchParams.has('note'), false);
});

test('back and forward restore page and persistent dialog state', async () => {
  const h = createHarness();
  h.history.start();
  await settle();
  const home = h.getNavigation();
  h.window.scrollY = 88;
  const bookmarks = { ...home, page: 'bookmarks' };
  h.history.navigate(bookmarks, 'push', home, 88);
  h.setNavigation(bookmarks);
  assert.equal(h.window.scrollY, 0);
  h.window.scrollY = 456;
  h.history.dialogChanged('app-settings', true);
  h.window.history.back();
  await settle();

  assert.equal(h.getDialog(), null);
  assert.equal(h.getNavigation().page, 'bookmarks');
  h.window.history.back();
  await settle();
  assert.equal(h.getNavigation().page, 'dashboard');
  assert.equal(h.window.scrollY, 88);
  h.window.history.forward();
  await settle();
  assert.equal(h.getNavigation().page, 'bookmarks');
  assert.equal(h.window.scrollY, 456);
});

test('closing a dialog returns to its parent entry instead of leaving a duplicate history step', async () => {
  const h = createHarness();
  h.history.start();
  await settle();
  h.history.dialogChanged('profile-settings', true);
  assert.equal(h.entries.length, 2);
  h.history.dialogChanged('profile-settings', false);
  await settle();

  assert.equal(h.entries.length, 2);
  assert.equal(h.cursor, 0);
  assert.equal(h.getDialog(), null);
});

test('switching from settings to backup history does not treat the settings close as a browser back', async () => {
  const h = createHarness();
  h.history.start();
  await settle();
  h.history.dialogChanged('app-settings', true);
  h.history.ignoreNextDialogClose('app-settings');
  h.history.dialogChanged('app-settings', false);
  h.history.dialogChanged('backup-history', true);

  assert.equal(new URL(h.window.location.href).searchParams.get('dialog'), 'backup-history');
  h.window.history.back();
  await settle();
  assert.equal(h.getDialog(), 'app-settings');
});

test('history state stores navigation context but never serializes editor contents', async () => {
  const h = createHarness();
  h.history.start();
  await settle();
  const previous = h.getNavigation();
  const editing = { ...previous, page: 'note', noteId: 'note-1', editing: true, editingDraft: { body: 'secret note body' } };
  h.history.navigate(editing, 'push', previous, 0);
  h.setNavigation(editing);

  const stored = h.window.history.state.qidian.navigation;
  assert.equal(stored.noteId, 'note-1');
  assert.equal(Object.hasOwn(stored, 'editingDraft'), false);
  assert.equal(JSON.stringify(h.entries).includes('secret note body'), false);
});

test('route navigation removes the transient global-search marker before pushing the destination', async () => {
  const h = createHarness();
  h.history.start();
  await settle();
  h.window.history.pushState({
    ...h.window.history.state,
    qidianSearchOverlay: true
  }, '', h.window.location.href);

  const dashboard = h.getNavigation();
  const bookmarks = { ...dashboard, page: 'bookmarks' };
  h.history.navigate(bookmarks, 'push', dashboard, 0);
  h.setNavigation(bookmarks);

  assert.equal(Object.hasOwn(h.window.history.state, 'qidianSearchOverlay'), false);
  h.window.history.back();
  await settle();
  assert.equal(h.getNavigation().page, 'dashboard');
});

test('browser back asks before leaving a changed editor and opens the target after confirmation', async () => {
  const h = createHarness();
  h.history.start();
  await settle();
  const previous = h.getNavigation();
  const editing = { ...previous, page: 'note', noteId: 'note-1', editing: true };
  h.history.navigate(editing, 'push', previous, 0);
  h.setNavigation(editing);
  h.window.history.back();
  await settle();

  assert.equal(h.getNavigation().page, 'dashboard');
  assert.equal(h.prompts.includes('confirm'), true);
  assert.ok(h.prompts.indexOf('confirm') < h.prompts.indexOf('save-before-leave'));
  assert.ok(h.events.indexOf('save-complete') < h.events.lastIndexOf('restore'));
});

test('browser back keeps the editor open when saving before leaving fails', async () => {
  const h = createHarness(undefined, true, false);
  h.history.start();
  await settle();
  const previous = h.getNavigation();
  const editing = { ...previous, page: 'note', noteId: 'note-1', editing: true };
  h.history.navigate(editing, 'push', previous, 0);
  h.setNavigation(editing);
  h.window.history.back();
  await settle();

  assert.equal(h.getNavigation().page, 'note');
  assert.equal(h.getNavigation().editing, true);
  assert.equal(h.prompts.includes('save-before-leave'), true);
});

test('canceling the browser-back prompt restores the editor location', async () => {
  const h = createHarness(undefined, false);
  h.history.start();
  await settle();
  const previous = h.getNavigation();
  const editing = { ...previous, page: 'note', noteId: 'note-1', editing: true };
  h.history.navigate(editing, 'push', previous, 0);
  h.setNavigation(editing);
  h.window.history.back();
  await settle();

  assert.equal(h.getNavigation().page, 'note');
  assert.equal(h.getNavigation().editing, true);
  assert.equal(new URL(h.window.location.href).searchParams.get('note'), 'note-1');
});
