import type { NoteType, VaultData, VaultNote } from '../../shared/api-contracts.js';
import { createDashboardActions } from '../features/dashboard/actions.ts';
import type { useDashboardStore } from '../features/dashboard/store.ts';
import { createNoteCardSnapshot } from '../features/notes/card-snapshot.ts';
import { isDraftNote, needsPublish, publishedNoteView, selectNotes } from '../features/notes/selectors.ts';
import type { useNoteListStore } from '../features/notes/store.ts';
import { createEditorSessionSnapshot } from '../features/editor/session-snapshot.ts';
import { createReaderSnapshot } from '../features/reader/snapshot.ts';
import type { useReaderStore } from '../features/reader/store.ts';
import type { useSidebarStore } from '../features/navigation/sidebar-store.ts';
import type { useNavigationStore } from '../features/navigation/store.ts';
import type { useGlobalSearchStore } from '../features/search/store.ts';

type NavigationStore = ReturnType<typeof useNavigationStore>;
type ReaderStore = Pick<ReturnType<typeof useReaderStore>, 'configure'>;
type DashboardStore = Pick<ReturnType<typeof useDashboardStore>, 'configure' | 'bindActions'>;
type SidebarStore = Pick<ReturnType<typeof useSidebarStore>, 'configure'>;
type NoteListStore = Pick<ReturnType<typeof useNoteListStore>, 'configure'>;
type GlobalSearchStore = Pick<ReturnType<typeof useGlobalSearchStore>, 'configure'>;

export type WorkspaceContentProjectionDependencies = {
  document: Document;
  navigationStore: NavigationStore;
  stores: {
    reader: ReaderStore;
    dashboard: DashboardStore;
    sidebar?: SidebarStore;
    noteList?: NoteListStore;
    globalSearch: GlobalSearchStore;
  };
  getVault: () => VaultData;
  mutateVault: <T>(operation: (vault: VaultData) => T) => T;
  persist: () => unknown;
  readableNoteBody: (body: unknown, title?: string) => { html: string };
  htmlToCompactText: (html: string) => string;
  noteBodyCompactText?: (body: unknown, title?: string) => string;
  displayTypeName: (type: NoteType) => string;
  typeLabel: (id: string) => string;
  safeUrl: (value: string) => boolean;
  formatFullDate: (timestamp: number) => string;
  isDraft: typeof isDraftNote;
  needsPublish: typeof needsPublish;
  publishedView: typeof publishedNoteView;
  hasDraftContent: (note: VaultNote) => boolean;
};

export function createWorkspaceContentProjections(dependencies: WorkspaceContentProjectionDependencies) {
  const noteBodyText = (body = '', title = '') => dependencies.noteBodyCompactText
    ? dependencies.noteBodyCompactText(body, title)
    : dependencies.htmlToCompactText(dependencies.readableNoteBody(body, title).html);
  const nowString = (timestamp: number | string) => new Date(timestamp).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  const fullDate = dependencies.formatFullDate;
  const noteCardSnapshot = createNoteCardSnapshot({ typeName: dependencies.typeLabel, bodyText: noteBodyText, formatDate: nowString });
  const editorSessionSnapshot = createEditorSessionSnapshot({ displayTypeName: dependencies.displayTypeName, isDraft: dependencies.isDraft });
  const readerSnapshot = (stored: VaultNote, working: boolean, note: VaultNote) => createReaderSnapshot({
    document: dependencies.document,
    stored,
    note,
    working,
    previewing: dependencies.navigationStore.previewing,
    readableNoteBody: dependencies.readableNoteBody,
    typeLabel: dependencies.typeLabel,
    formatDate: fullDate,
    safeUrl: dependencies.safeUrl,
    isDraft: dependencies.isDraft,
    needsPublish: dependencies.needsPublish
  });

  dependencies.stores.globalSearch.configure({
    bodyText: body => dependencies.htmlToCompactText(body),
    hasDraftContent: dependencies.hasDraftContent,
    typeLabel: dependencies.typeLabel,
    formatDate: nowString,
    isSafeUrl: dependencies.safeUrl
  });

  dependencies.stores.reader.configure({
    document: dependencies.document,
    readableNoteBody: dependencies.readableNoteBody,
    typeLabel: dependencies.typeLabel,
    formatDate: fullDate,
    safeUrl: dependencies.safeUrl,
    isDraft: dependencies.isDraft,
    needsPublish: dependencies.needsPublish,
    publishedView: dependencies.publishedView
  });

  const listNotes = (query = '') => selectNotes(dependencies.getVault().notes, {
    active: dependencies.navigationStore.active,
    typeFilter: dependencies.navigationStore.typeFilter,
    query,
    hasDraftContent: dependencies.hasDraftContent,
    bodyText: noteBodyText
  });

  dependencies.stores.dashboard.configure({
    isDraft: dependencies.isDraft,
    publishedView: dependencies.publishedView,
    noteCard: noteCardSnapshot,
    isSafeUrl: dependencies.safeUrl
  });
  dependencies.stores.dashboard.bindActions(createDashboardActions({
    getVault: dependencies.getVault,
    mutateVault: dependencies.mutateVault,
    persist: dependencies.persist
  }));
  dependencies.stores.sidebar?.configure({
    isDraft: dependencies.isDraft,
    needsPublish: dependencies.needsPublish,
    hasDraftContent: dependencies.hasDraftContent,
    displayTypeName: dependencies.displayTypeName
  });
  dependencies.stores.noteList?.configure({
    hasDraftContent: dependencies.hasDraftContent,
    bodyText: noteBodyText,
    noteCard: noteCardSnapshot,
    typeName: dependencies.typeLabel,
    displayTypeName: dependencies.displayTypeName
  });

  return { noteBodyText, nowString, fullDate, noteCardSnapshot, editorSessionSnapshot, readerSnapshot, listNotes };
}
