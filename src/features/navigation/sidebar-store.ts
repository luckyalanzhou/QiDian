import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { useVaultStore } from '../vault/store';
import type { BookmarkItem, NoteType, VaultNote } from '../../../shared/api-contracts.js';

export type SidebarSnapshot = {
  counts: {
    all: number;
    recent: number;
    pinned: number;
    drafts: number;
    bookmarks: number;
    trash: number;
  };
  noteTypes: Array<{ id: string; name: string; count: number }>;
  typesExpanded: boolean;
};

export type SidebarSnapshotDependencies = {
  isDraft: (note: VaultNote) => boolean;
  needsPublish: (note: VaultNote) => boolean;
  hasDraftContent: (note: VaultNote) => boolean;
  displayTypeName: (type: NoteType) => string;
};

const emptySnapshot = (): SidebarSnapshot => ({
  counts: { all: 0, recent: 0, pinned: 0, drafts: 0, bookmarks: 0, trash: 0 },
  noteTypes: [],
  typesExpanded: true
});

function bookmarkLinkCount(items: readonly BookmarkItem[] = []): number {
  return items.reduce((total, item) => total + (item.kind === 'link' ? 1 : bookmarkLinkCount(item.children || [])), 0);
}

export const useSidebarStore = defineStore('sidebar', () => {
  const vault = useVaultStore();
  const dependencyRevision = ref(0);
  let dependencies: SidebarSnapshotDependencies | null = null;

  const snapshot = computed(() => {
    // The vault is raw during the staged migration; generation is the
    // invalidation boundary for every count and navigation facet.
    void vault.generation;
    void dependencyRevision.value;
    const value = vault.value;
    const configured = dependencies;
    if (!vault.ready || !value || !configured) return emptySnapshot();

    const notes = value.notes || [];
    let all = 0;
    let pinned = 0;
    let drafts = 0;
    const typeCounts = new Map<string, number>();
    for (const note of notes) {
      if (configured.needsPublish(note) && configured.hasDraftContent(note)) drafts++;
      if (configured.isDraft(note)) continue;
      all++;
      if (note.pinned) pinned++;
      const typeId = note.type;
      typeCounts.set(typeId, (typeCounts.get(typeId) || 0) + 1);
    }
    const types = value.noteTypes || [];
    return {
      counts: {
        all,
        recent: all,
        pinned,
        drafts,
        bookmarks: bookmarkLinkCount(value.bookmarks || []),
        trash: (value.trash || []).length
      },
      noteTypes: types.map((type: NoteType) => ({
        id: type.id,
        name: configured.displayTypeName(type),
        count: typeCounts.get(type.id) || 0
      })),
      typesExpanded: value.noteTypesExpanded !== false
    };
  });

  function configure(next: SidebarSnapshotDependencies) {
    dependencies = next;
    dependencyRevision.value += 1;
  }

  return { snapshot, configure };
});
