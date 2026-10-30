import { nextTick } from 'vue';
import type { WorkspaceNavigationState } from './transitions.ts';
import { getWorkspaceScrollTop, listenToWorkspaceScroll, scrollWorkspaceTo } from './workspace-scroll.ts';

export type PersistentWorkspaceDialog = 'app-settings' | 'profile-settings' | 'backup-history' | 'version-info';
export type HistoryNavigationState = Omit<WorkspaceNavigationState, 'editingDraft'>;

type HistoryEntry = {
  version: 1;
  index: number;
  navigation: HistoryNavigationState;
  dialog: PersistentWorkspaceDialog | null;
  scrollY: number;
};

type BrowserHistoryDependencies = {
  window: Window & typeof globalThis;
  getNavigation: () => WorkspaceNavigationState;
  restoreNavigation: (state: WorkspaceNavigationState, scrollY: number) => boolean;
  restoreDialog: (dialog: PersistentWorkspaceDialog | null) => void;
  hasUnsavedEditorChanges: () => boolean;
  saveEditorBeforeLeaving: () => unknown;
  confirmLeaveEditor: () => Promise<boolean>;
  onInvalidRoute: () => void;
};

const DIALOGS = new Set<PersistentWorkspaceDialog>([
  'app-settings', 'profile-settings', 'backup-history', 'version-info'
]);
const PAGES = new Set<WorkspaceNavigationState['page']>(['dashboard', 'home', 'bookmarks', 'trash', 'note']);

function safeNavigation(state: WorkspaceNavigationState | HistoryNavigationState): HistoryNavigationState {
  return {
    page: state.page,
    active: state.active,
    typeFilter: state.typeFilter,
    noteQuery: state.noteQuery,
    noteId: state.noteId,
    editing: state.editing,
    previewing: state.previewing,
    noteReturn: state.noteReturn ? { ...state.noteReturn } : null
  };
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<HistoryEntry>;
  return entry.version === 1 && Number.isInteger(entry.index) && !!entry.navigation && typeof entry.navigation === 'object';
}

function routeMatches(entry: HistoryEntry, url: URL): boolean {
  return url.searchParams.get('qidian') === entry.navigation.page
    && (url.searchParams.get('note') || null) === entry.navigation.noteId
    && (url.searchParams.get('edit') === '1') === entry.navigation.editing
    && (url.searchParams.get('dialog') || null) === entry.dialog;
}

function setRoute(url: URL, navigation: HistoryNavigationState, dialog: PersistentWorkspaceDialog | null): URL {
  url.searchParams.set('qidian', navigation.page);
  if (navigation.page === 'note' && navigation.noteId) url.searchParams.set('note', navigation.noteId);
  else url.searchParams.delete('note');
  if (navigation.page === 'note' && navigation.editing) url.searchParams.set('edit', '1');
  else url.searchParams.delete('edit');
  if (dialog) url.searchParams.set('dialog', dialog);
  else url.searchParams.delete('dialog');
  return url;
}

function routeFromUrl(url: URL, fallback: WorkspaceNavigationState): HistoryEntry | null {
  const pageValue = url.searchParams.get('qidian');
  if (!pageValue) return null;
  const page = PAGES.has(pageValue as WorkspaceNavigationState['page'])
    ? pageValue as WorkspaceNavigationState['page']
    : 'dashboard';
  const noteId = page === 'note' ? url.searchParams.get('note') : null;
  const dialogValue = url.searchParams.get('dialog');
  const dialog = dialogValue && DIALOGS.has(dialogValue as PersistentWorkspaceDialog)
    ? dialogValue as PersistentWorkspaceDialog
    : null;
  const navigation = safeNavigation(fallback);
  navigation.page = page;
  navigation.noteId = noteId;
  navigation.editing = page === 'note' && url.searchParams.get('edit') === '1';
  navigation.previewing = page === 'note' && !navigation.editing;
  if (page !== 'note') {
    navigation.noteReturn = null;
    navigation.editing = false;
    navigation.previewing = false;
  }
  return { version: 1, index: 0, navigation, dialog, scrollY: 0 };
}

export function createBrowserHistoryController(dependencies: BrowserHistoryDependencies) {
  const { window } = dependencies;
  let started = false;
  let applyingPopState = false;
  let dialog: PersistentWorkspaceDialog | null = null;
  let historyIndex = 0;
  const dialogParents = new Map<number, number>();
  const ignoredDialogCloses = new Set<PersistentWorkspaceDialog>();
  let lastNavigation = safeNavigation(dependencies.getNavigation());
  let lastScrollY = getWorkspaceScrollTop(window);
  let stopListeningToScroll: (() => void) | null = null;
  let guardedDestination: number | null = null;
  let waitingForGuardRestore = false;
  let bypassGuardIndex: number | null = null;

  function historyState(entry: HistoryEntry) {
    const current = window.history.state;
    const state = { ...(current && typeof current === 'object' ? current : {}) } as Record<string, unknown>;
    delete state.qidianSearchOverlay;
    return { ...state, qidian: entry };
  }

  function write(entry: HistoryEntry, mode: 'push' | 'replace') {
    const url = setRoute(new URL(window.location.href), entry.navigation, entry.dialog);
    const state = historyState(entry);
    if (mode === 'push') window.history.pushState(state, '', url);
    else window.history.replaceState(state, '', url);
  }

  function currentEntry(navigation: WorkspaceNavigationState | HistoryNavigationState, entryDialog = dialog, scrollY = getWorkspaceScrollTop(window), index = historyIndex): HistoryEntry {
    return { version: 1, index, navigation: safeNavigation(navigation), dialog: entryDialog, scrollY: Math.max(0, scrollY) };
  }

  function navigate(
    navigation: WorkspaceNavigationState,
    mode: 'push' | 'replace',
    previousNavigation: WorkspaceNavigationState | HistoryNavigationState = dependencies.getNavigation(),
    previousScrollY = lastScrollY
  ) {
    if (!started || applyingPopState) return;
    if (mode === 'push') {
      write(currentEntry(previousNavigation, dialog, previousScrollY), 'replace');
      historyIndex += 1;
    }
    write(currentEntry(navigation, dialog, mode === 'push' ? 0 : getWorkspaceScrollTop(window)), mode);
    lastNavigation = safeNavigation(navigation);
    lastScrollY = mode === 'push' ? 0 : getWorkspaceScrollTop(window);
    if (mode === 'push' && getWorkspaceScrollTop(window) > 0 && getWorkspaceScrollTop(window) === previousScrollY) {
      scrollWorkspaceTo(window, 0);
    }
  }

  function stateChanged() {
    const next = safeNavigation(dependencies.getNavigation());
    if (JSON.stringify(next) === JSON.stringify(lastNavigation)) return;
    const pushesEntry = next.page !== lastNavigation.page
      || next.noteId !== lastNavigation.noteId
      || next.editing !== lastNavigation.editing
      || next.previewing !== lastNavigation.previewing;
    navigate(dependencies.getNavigation(), pushesEntry ? 'push' : 'replace', lastNavigation, lastScrollY);
  }

  function dialogChanged(next: PersistentWorkspaceDialog, open: boolean) {
    if (!started || applyingPopState) return;
    if (open) {
      if (dialog === next) return;
      write(currentEntry(dependencies.getNavigation(), dialog, getWorkspaceScrollTop(window)), 'replace');
      const parentIndex = historyIndex;
      dialog = next;
      historyIndex += 1;
      dialogParents.set(historyIndex, parentIndex);
      write(currentEntry(dependencies.getNavigation(), dialog, 0), 'push');
      return;
    }
    if (dialog !== next) return;
    if (ignoredDialogCloses.delete(next)) return;
    dialog = null;
    const parentIndex = dialogParents.get(historyIndex);
    if (parentIndex === historyIndex - 1) {
      dialogParents.delete(historyIndex);
      window.history.back();
      return;
    }
    write(currentEntry(dependencies.getNavigation(), null, getWorkspaceScrollTop(window)), 'replace');
  }

  function entryForPop(event: PopStateEvent): HistoryEntry | null {
    const saved = (event.state as { qidian?: unknown } | null)?.qidian;
    if (isHistoryEntry(saved) && routeMatches(saved, new URL(window.location.href))) return saved;
    return routeFromUrl(new URL(window.location.href), dependencies.getNavigation());
  }

  async function restoreEntry(entry: HistoryEntry) {
    applyingPopState = true;
    historyIndex = entry.index;
    const restored = dependencies.restoreNavigation({
      ...entry.navigation,
      editingDraft: null
    }, entry.scrollY);
    dialog = restored ? entry.dialog : null;
    dependencies.restoreDialog(dialog);
    await nextTick();
    if (!restored) {
      dependencies.onInvalidRoute();
      const fallback = safeNavigation(dependencies.getNavigation());
      const replacement = currentEntry(fallback, null, 0, historyIndex);
      write(replacement, 'replace');
      lastNavigation = fallback;
      lastScrollY = 0;
      applyingPopState = false;
      return;
    }
    const hasFragment = new URL(window.location.href).hash.length > 0;
    const targetScroll = Math.max(0, entry.scrollY);
    if (!hasFragment) window.requestAnimationFrame(() => window.requestAnimationFrame(() => scrollWorkspaceTo(window, targetScroll)));
    lastNavigation = safeNavigation(dependencies.getNavigation());
    lastScrollY = targetScroll;
    applyingPopState = false;
  }

  async function onPopState(event: PopStateEvent) {
    const entry = entryForPop(event);
    if (!entry) {
      if (dependencies.getNavigation().editing) dependencies.saveEditorBeforeLeaving();
      return;
    }
    if (waitingForGuardRestore && entry.index === historyIndex) {
      waitingForGuardRestore = false;
      const destination = guardedDestination;
      guardedDestination = null;
      if (destination !== null) {
        const allow = await dependencies.confirmLeaveEditor();
        if (allow) {
          const saved = await dependencies.saveEditorBeforeLeaving();
          if (saved === false) return;
          bypassGuardIndex = destination;
          window.history.go(destination - historyIndex);
        }
      }
      return;
    }
    if (bypassGuardIndex === entry.index) {
      bypassGuardIndex = null;
      await restoreEntry(entry);
      return;
    }
    const current = dependencies.getNavigation();
    const isChangingWorkspace = entry.navigation.page !== current.page
      || entry.navigation.noteId !== current.noteId
      || entry.navigation.editing !== current.editing;
    if (current.editing && isChangingWorkspace && dependencies.hasUnsavedEditorChanges() && entry.index !== historyIndex) {
      guardedDestination = entry.index;
      waitingForGuardRestore = true;
      window.history.go(historyIndex - entry.index);
      return;
    }
    await restoreEntry(entry);
  }

  function onScroll() {
    lastScrollY = getWorkspaceScrollTop(window);
  }

  function ignoreNextDialogClose(next: PersistentWorkspaceDialog) {
    ignoredDialogCloses.add(next);
  }

  function start() {
    if (started) return;
    const url = new URL(window.location.href);
    const saved = (window.history.state as { qidian?: unknown } | null)?.qidian;
    const savedEntry = isHistoryEntry(saved) ? saved : null;
    const urlEntry = routeFromUrl(url, dependencies.getNavigation());
    const initial = urlEntry
      ? (savedEntry && routeMatches(savedEntry, url) ? savedEntry : urlEntry)
      : (savedEntry || currentEntry(dependencies.getNavigation(), null, getWorkspaceScrollTop(window), 0));
    historyIndex = initial.index;
    dialog = initial.dialog;
    started = true;
    write(initial, 'replace');
    window.addEventListener('popstate', onPopState);
    stopListeningToScroll = listenToWorkspaceScroll(window, onScroll);
    void restoreEntry(initial);
  }

  function dispose() {
    if (!started) return;
    window.removeEventListener('popstate', onPopState);
    stopListeningToScroll?.();
    stopListeningToScroll = null;
    started = false;
  }

  return { start, dispose, navigate, stateChanged, dialogChanged, ignoreNextDialogClose };
}
