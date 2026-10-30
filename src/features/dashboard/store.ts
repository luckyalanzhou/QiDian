import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { useVaultStore } from '../vault/store';
import { useNavigationStore } from '../navigation/store';
import type { NoteCardItem } from '../notes/types';
import { createDashboardSnapshot, type DashboardSnapshotOptions } from './snapshot';

export type DashboardNote = NoteCardItem;

export type DashboardBookmarkLink = {
  id: string;
  kind: 'link';
  title: string;
  url: string;
  path: string;
};

export type DashboardBookmarkFolder = {
  id: string;
  kind: 'folder';
  title: string;
  linkCount: number;
  defaultOpen: boolean;
  children: DashboardBookmarkNode[];
};

export type DashboardBookmarkNode = DashboardBookmarkFolder | DashboardBookmarkLink;

export type DashboardSnapshot = {
  noteCount: number;
  notes: DashboardNote[];
  bookmarkCount: number;
  folderCount: number;
  groups: DashboardBookmarkNode[];
  pinnedLinks: DashboardBookmarkLink[];
  layout: 'single' | 'double';
  folderStates: Record<string, boolean>;
};

export type DashboardSnapshotDependencies = Pick<DashboardSnapshotOptions, 'isDraft' | 'publishedView' | 'noteCard' | 'isSafeUrl'>;
export type DashboardActions = {
  saveFolder: (id: string, open: boolean) => void;
  setLayout: (layout: 'single' | 'double') => void;
  setAllFolders: (ids: string[], open: boolean) => void;
};

const emptySnapshot = (): DashboardSnapshot => ({
  noteCount: 0,
  notes: [],
  bookmarkCount: 0,
  folderCount: 0,
  groups: [],
  pinnedLinks: [],
  layout: 'single',
  folderStates: {}
});

export const useDashboardStore = defineStore('dashboard', () => {
  const navigation = useNavigationStore();
  const active = computed(() => vault.ready && navigation.page === 'dashboard');
  const providerRevision = ref(0);
  const vault = useVaultStore();
  let snapshotDependencies: DashboardSnapshotDependencies | null = null;
  let actions: DashboardActions = {
    saveFolder: () => undefined,
    setLayout: () => undefined,
    setAllFolders: () => undefined
  };

  const snapshot = computed(() => {
    // Vault data is intentionally held as a raw object during the compatibility
    // migration; its generation is the reactive invalidation boundary.
    void vault.generation;
    void providerRevision.value;
    const value = vault.value;
    if (!vault.ready || !value || !snapshotDependencies) return emptySnapshot();
    return createDashboardSnapshot({
      notes: value.notes || [],
      bookmarks: value.bookmarks || [],
      folderStates: value.dashboardBookmarkFolders,
      layout: value.dashboardBookmarkLayout,
      ...snapshotDependencies
    });
  });

  function configure(dependencies: DashboardSnapshotDependencies) {
    snapshotDependencies = dependencies;
    providerRevision.value += 1;
  }

  function bindActions(bindings: DashboardActions) {
    actions = bindings;
  }

  function saveFolder(id: string, open: boolean) {
    actions.saveFolder(id, open);
  }

  function setLayout(layout: 'single' | 'double') {
    actions.setLayout(layout);
  }

  function setAllFolders(ids: string[], open: boolean) {
    actions.setAllFolders(ids, open);
  }

  return { active, snapshot, configure, bindActions, saveFolder, setLayout, setAllFolders };
});
