import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { useVaultStore } from '../vault/store';
import { useNavigationStore } from '../navigation/store';
import type { NoteCardItem } from './types';
import type { NoteType, VaultNote } from '../../../shared/api-contracts.js';
import { selectNotes } from './selectors';

export type NoteListSnapshot = {
  heading: string;
  resultCount: number;
  query: string;
  active: string;
  typeFilter: string;
  noteTypes: Array<{ id: string; name: string }>;
  notes: NoteCardItem[];
  emptyMessage: string;
};

export type NoteListSnapshotDependencies = {
  hasDraftContent: (note: VaultNote) => boolean;
  bodyText: (body: string, title: string) => string;
  noteCard: (note: VaultNote) => NoteCardItem;
  typeName: (id: string) => string;
  displayTypeName: (type: NoteType) => string;
};

const emptySnapshot = (): NoteListSnapshot => ({
  heading: '全部笔记',
  resultCount: 0,
  query: '',
  active: 'all',
  typeFilter: 'all',
  noteTypes: [],
  notes: [],
  emptyMessage: '还没有笔记，先写下第一条。'
});

export const useNoteListStore = defineStore('note-list', () => {
  const providerRevision = ref(0);
  const vault = useVaultStore();
  const navigation = useNavigationStore();
  const active = computed(() => vault.ready && navigation.page === 'home');
  let dependencies: NoteListSnapshotDependencies | null = null;

  const snapshot = computed(() => {
    // These explicit dependencies invalidate the projection after account data
    // changes or when the user changes the active list, type, or query.
    void vault.generation;
    void navigation.active;
    void navigation.typeFilter;
    void navigation.noteQuery;
    void providerRevision.value;
    const value = vault.value;
    const configured = dependencies;
    if (!vault.ready || !value || !configured) return emptySnapshot();

    const filtered = selectNotes(value.notes || [], {
      active: navigation.active,
      typeFilter: navigation.typeFilter,
      query: navigation.noteQuery,
      hasDraftContent: configured.hasDraftContent,
      bodyText: configured.bodyText
    });
    const heading = navigation.typeFilter !== 'all'
      ? configured.typeName(navigation.typeFilter)
      : navigation.active === 'all' ? '全部笔记'
        : navigation.active === 'recent' ? '最近编辑'
          : navigation.active === 'pinned' ? '重要收藏'
            : navigation.active === 'drafts' ? '草稿箱'
              : navigation.active;

    return {
      heading,
      resultCount: filtered.length,
      query: navigation.noteQuery,
      active: navigation.active,
      typeFilter: navigation.typeFilter,
      noteTypes: (value.noteTypes || []).map((type: NoteType) => ({ id: type.id, name: configured.displayTypeName(type) })),
      notes: filtered.map(configured.noteCard),
      emptyMessage: navigation.active === 'drafts' ? '暂无草稿。可以创建一条笔记。' : '还没有笔记，先写下第一条。'
    };
  });

  function configure(next: NoteListSnapshotDependencies) {
    dependencies = next;
    providerRevision.value += 1;
  }

  return { active, snapshot, configure };
});
