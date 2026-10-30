import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { EditorAction, EditorForm, EditorOutlineItem, EditorSession, EditorSnapshot, EditorToolbarState } from './types';
import { useNavigationStore } from '../navigation/store.ts';
import { useVaultStore } from '../vault/store.ts';

export type EditorRuntimeActions = {
  initialize: () => void;
  dispatch: (action: EditorAction) => void | Promise<void>;
  formChanged?: () => void;
  formBlurred?: () => void;
};

const emptySnapshot = (): EditorSnapshot => ({
  noteId: '', noteTypes: [], categories: [], publishLabel: '发布笔记', pasteMode: 'rich', revision: 0
});

const emptyForm = (): EditorForm => ({ title: '', type: 'note', category: '未分类', tags: '', source: '' });
export type SlashMenuState = { visible: boolean; left: number; top: number };
const emptyToolbar = (): EditorToolbarState => ({
  marks: { bold: false, italic: false, underline: false, strikeThrough: false, code: false },
  block: 'p', inTable: false, inCodeBlock: false, inCallout: false,
  canUndo: false, canRedo: false, hasLink: false, canConvertTable: false,
  paragraph: { visible: false, moveUp: false, moveDown: false, duplicate: false, delete: false }
});

export const useEditorStore = defineStore('editor', () => {
  const navigation = useNavigationStore();
  const vault = useVaultStore();
  const active = computed(() => vault.ready && navigation.page === 'note' && navigation.editing && !!navigation.noteId);
  const snapshot = ref(emptySnapshot());
  const form = ref(emptyForm());
  const toolbar = ref(emptyToolbar());
  const outline = ref<EditorOutlineItem[]>([]);
  const slashMenu = ref<SlashMenuState>({ visible: false, left: 0, top: 0 });
  const baseline = ref<string | null>(null);
  const transientNewNoteId = ref<string | null>(null);
  let runtime: EditorRuntimeActions = { initialize: () => undefined, dispatch: () => undefined };

  function sync(next: EditorSession) {
    const { title, type, category, tags, source, ...view } = next;
    snapshot.value = { ...view, revision: snapshot.value.revision + 1 };
    form.value = { title, type, category, tags, source };
    toolbar.value = emptyToolbar();
    outline.value = [];
  }

  function setToolbarState(next: EditorToolbarState) {
    toolbar.value = { ...next, marks: { ...next.marks }, paragraph: { ...next.paragraph } };
  }

  function setOutline(next: EditorOutlineItem[]) {
    outline.value = next.map(item => ({ ...item }));
  }

  function showSlashMenu(position: Pick<SlashMenuState, 'left' | 'top'>) {
    slashMenu.value = { visible: true, ...position };
  }

  function closeSlashMenu() {
    slashMenu.value.visible = false;
  }

  function setBaseline(value: string | null) {
    baseline.value = value;
  }

  function setTransientNewNoteId(value: string | null) {
    transientNewNoteId.value = value;
  }

  function clearTransientNewNote() {
    transientNewNoteId.value = null;
  }

  function bindRuntime(actions: EditorRuntimeActions) {
    runtime = actions;
  }

  function initialize() {
    runtime.initialize();
  }

  function dispatch(action: EditorAction) {
    return runtime.dispatch(action);
  }

  function formChanged() {
    runtime.formChanged?.();
  }

  function formBlurred() {
    runtime.formBlurred?.();
  }

  return { active, snapshot, form, toolbar, outline, slashMenu, baseline, transientNewNoteId, sync, setToolbarState, setOutline, showSlashMenu, closeSlashMenu, setBaseline, setTransientNewNoteId, clearTransientNewNote, bindRuntime, initialize, dispatch, formChanged, formBlurred };
});
