import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { useVaultStore } from '../vault/store.ts';
import type { GlobalSearchSnapshotOptions } from './snapshot';
import { createGlobalSearchNoteIndex, createGlobalSearchSnapshot, type GlobalSearchIndexedNote } from './snapshot.ts';

export type GlobalSearchDependencies = Pick<GlobalSearchSnapshotOptions, 'bodyText' | 'hasDraftContent' | 'typeLabel' | 'formatDate' | 'isSafeUrl'>;

const emptySnapshot = () => ({ notes: [], bookmarks: [], hasMoreNotes: false, hasMoreBookmarks: false });

export const useGlobalSearchStore = defineStore('global-search', () => {
  const open = ref(false);
  const query = ref('');
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

    return createGlobalSearchSnapshot({
      notes: currentNotes,
      bookmarks: value.bookmarks || [],
      query: query.value,
      ...(currentQuery ? { noteIndex: cachedNotes || undefined } : {}),
      ...currentDependencies
    });
  });

  function configure(next: GlobalSearchDependencies) {
    clearNoteIndex();
    dependencies = next;
    providerRevision.value += 1;
  }

  function show(initialQuery = '', focusReturnTarget: HTMLElement | null = null) {
    nextFocusReturnTarget = focusReturnTarget;
    query.value = initialQuery;
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
    query.value = value;
  }

  return { open, query, snapshot, configure, show, close, consumeFocusReturnTarget, setQuery };
});
