import { defineStore } from 'pinia';
import { ref } from 'vue';

export type NoteTypeDialogMode = 'create' | 'edit' | 'delete';

export type NoteTypeDialogOption = {
  id: string;
  name: string;
  autoCreate?: boolean;
};

export type NoteTypeDialogSubmission = {
  mode: NoteTypeDialogMode;
  id: string | null;
  name?: string;
  targetId?: string;
};

export type NoteTypeDialogConfiguration = {
  mode: NoteTypeDialogMode;
  id: string | null;
  title: string;
  hint: string;
  name?: string;
  noteCount?: number;
  options?: NoteTypeDialogOption[];
};

type SaveHandler = (input: NoteTypeDialogSubmission) => Promise<void> | void;

export const useNoteTypeDialogStore = defineStore('note-type-dialog', () => {
  const visible = ref(false);
  const mode = ref<NoteTypeDialogMode>('create');
  const id = ref<string | null>(null);
  const title = ref('新增笔记类型');
  const hint = ref('');
  const name = ref('');
  const noteCount = ref(0);
  const options = ref<NoteTypeDialogOption[]>([]);
  let saveHandler: SaveHandler = () => undefined;

  function open(configuration: NoteTypeDialogConfiguration) {
    mode.value = configuration.mode;
    id.value = configuration.id;
    title.value = configuration.title;
    hint.value = configuration.hint;
    name.value = configuration.name || '';
    noteCount.value = configuration.noteCount || 0;
    options.value = configuration.options || [];
    visible.value = true;
  }

  function close() {
    visible.value = false;
  }

  function bindSave(handler: SaveHandler) {
    saveHandler = handler;
  }

  function submit(input: NoteTypeDialogSubmission) {
    return saveHandler(input);
  }

  return { visible, mode, id, title, hint, name, noteCount, options, open, close, bindSave, submit };
});
