import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { useVaultStore } from '../vault/store.ts';
import type { GlobalSearchSnapshotOptions } from './snapshot';
import { createGlobalSearchSnapshot } from './snapshot.ts';

export type GlobalSearchDependencies = Pick<GlobalSearchSnapshotOptions, 'bodyText' | 'typeLabel' | 'formatDate' | 'isSafeUrl'>;

const emptySnapshot = () => ({ notes: [], bookmarks: [] });

export const useGlobalSearchStore = defineStore('global-search', () => {
  const open = ref(false);
  const query = ref('');
  const providerRevision = ref(0);
  const vault = useVaultStore();
  let dependencies: GlobalSearchDependencies | null = null;

  const snapshot = computed(() => {
    void vault.generation;
    void providerRevision.value;
    const value = vault.value;
    if (!vault.ready || !value || !dependencies) return emptySnapshot();
    return createGlobalSearchSnapshot({
      notes: value.notes || [],
      bookmarks: value.bookmarks || [],
      query: query.value,
      ...dependencies
    });
  });

  function configure(next: GlobalSearchDependencies) {
    dependencies = next;
    providerRevision.value += 1;
  }

  function show(initialQuery = '') {
    query.value = initialQuery;
    open.value = true;
  }

  function close() {
    open.value = false;
  }

  function setQuery(value: string) {
    query.value = value;
  }

  return { open, query, snapshot, configure, show, close, setQuery };
});
