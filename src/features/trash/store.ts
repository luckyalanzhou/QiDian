import { computed } from 'vue';
import { defineStore } from 'pinia';
import { useVaultStore } from '../vault/store';
import { useNavigationStore } from '../navigation/store';
import { createTrashSnapshot } from './snapshot';
import type { TrashSnapshot } from './snapshot';

const emptySnapshot = (): TrashSnapshot => ({ count: 0, entries: [] });

export type TrashActions = {
  restore: (id: string) => Promise<boolean>;
  clearAll: () => Promise<boolean>;
  pruneExpired: () => number;
};

export const useTrashStore = defineStore('trash', () => {
  const vault = useVaultStore();
  const navigation = useNavigationStore();
  const active = computed(() => vault.ready && navigation.page === 'trash');
  let actions: TrashActions = { restore: async () => false, clearAll: async () => false, pruneExpired: () => 0 };
  const snapshot = computed(() => {
    void vault.generation;
    return vault.ready && vault.value ? createTrashSnapshot(vault.value.trash || []) : emptySnapshot();
  });

  function bindActions(bindings: TrashActions) {
    actions = bindings;
  }

  function restore(id: string) {
    return actions.restore(id);
  }

  function clearAll() {
    return actions.clearAll();
  }

  function pruneExpired() {
    return actions.pruneExpired();
  }

  return { active, snapshot, bindActions, restore, clearAll, pruneExpired };
});

export type { TrashEntryView, TrashSnapshot } from './snapshot';
