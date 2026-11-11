import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { useVaultStore } from '../vault/store.ts';
import type { GlobalSearchSnapshotOptions } from './snapshot';
import { createGlobalSearchNoteIndex, createGlobalSearchSnapshot, type GlobalSearchIndexedNote } from './snapshot.ts';

export type GlobalSearchDependencies = Pick<GlobalSearchSnapshotOptions, 'bodyText' | 'hasDraftContent' | 'typeLabel' | 'formatDate' | 'isSafeUrl'>;

const emptySnapshot = () => ({ notes: [], bookmarks: [], hasMoreNotes: false, hasMoreBookmarks: false });
const SEARCH_BATCH_SIZE = 12;
export type GlobalSearchFilter = 'all' | 'notes' | 'bookmarks';

export const useGlobalSearchStore = defineStore('global-search', () => {
  const open = ref(false);
  const query = ref('');
  const filter = ref<GlobalSearchFilter>('all');
  const noteLimit = ref(SEARCH_BATCH_SIZE);
  const bookmarkLimit = ref(SEARCH_BATCH_SIZE);
  const returnContext = ref<{ id: string; query: string; scrollTop: number } | null>(null);
  const restoringResult = ref(false);
  const providerRevision = ref(0);
  const vault = useVaultStore();
  let dependencies: GlobalSearchDependencies | null = null;
  let cachedNotes: GlobalSearchIndexedNote[] | null = null;
  let cachedGeneration = -1;
  let cachedProviderRevision = -1;
  let nextFocusReturnTarget: HTMLElement | null = null;

  function clearNoteIndex() {
    cachedNotes = null;
    cachedGeneration = -1;
    cachedProviderRevision = -1;
  }

  const snapshot = computed(() => {
    const generation = vault.generation;
    const currentProviderRevision = providerRevision.value;
    const value = vault.value;
    if (!vault.ready || !value || !dependencies) {
      clearNoteIndex();
      return emptySnapshot();
    }

    const currentDependencies = dependencies;
    const currentNotes = value.notes || [];
    const currentQuery = query.value.trim();
    if (!currentQuery) {
      clearNoteIndex();
    } else if (
      !cachedNotes
      || cachedGeneration !== generation
      || cachedProviderRevision !== currentProviderRevision
    ) {
      clearNoteIndex();
      cachedNotes = createGlobalSearchNoteIndex(currentNotes, currentDependencies.bodyText, currentDependencies.hasDraftContent);
      cachedGeneration = generation;
      cachedProviderRevision = currentProviderRevision;
    }

    const result = createGlobalSearchSnapshot({
      notes: currentNotes,
      bookmarks: value.bookmarks || [],
      query: query.value,
      noteLimit: noteLimit.value,
      bookmarkLimit: bookmarkLimit.value,
      ...(currentQuery ? { noteIndex: cachedNotes || undefined } : {}),
      ...currentDependencies
    });
    return {
      ...result,
      notes: filter.value === 'bookmarks' ? [] : result.notes,
      bookmarks: filter.value === 'notes' ? [] : result.bookmarks
    };
  });

  function configure(next: GlobalSearchDependencies) {
    clearNoteIndex();
    dependencies = next;
    providerRevision.value += 1;
  }

  function show(initialQuery = '', focusReturnTarget: HTMLElement | null = null) {
    returnContext.value = null;
    restoringResult.value = false;
    nextFocusReturnTarget = focusReturnTarget;
    query.value = initialQuery;
    filter.value = 'all';
    noteLimit.value = SEARCH_BATCH_SIZE;
    bookmarkLimit.value = SEARCH_BATCH_SIZE;
    open.value = true;
  }

  function returnToResults() {
    if (!returnContext.value) return;
    query.value = returnContext.value.query;
    restoringResult.value = true;
    open.value = true;
  }

  function close() {
    nextFocusReturnTarget = null;
    open.value = false;
    clearNoteIndex();
  }

  function consumeFocusReturnTarget() {
    const target = nextFocusReturnTarget;
    nextFocusReturnTarget = null;
    return target;
  }

  function setQuery(value: string) {
    if (query.value !== value) {
      noteLimit.value = SEARCH_BATCH_SIZE;
      bookmarkLimit.value = SEARCH_BATCH_SIZE;
      returnContext.value = null;
    }
    query.value = value;
  }

  function setFilter(value: GlobalSearchFilter) {
    filter.value = value;
    noteLimit.value = SEARCH_BATCH_SIZE;
    bookmarkLimit.value = SEARCH_BATCH_SIZE;
  }

  function loadMore(kind: 'notes' | 'bookmarks') {
    if (kind === 'notes') noteLimit.value += SEARCH_BATCH_SIZE;
    else bookmarkLimit.value += SEARCH_BATCH_SIZE;
  }

  function clearReturnContext(currentNoteId?: string | null) {
    if (!currentNoteId || returnContext.value?.id !== currentNoteId) returnContext.value = null;
  }

  return { open, query, filter, snapshot, returnContext, restoringResult, returnToResults, configure, show, close, consumeFocusReturnTarget, setQuery, setFilter, loadMore, clearReturnContext };
});
