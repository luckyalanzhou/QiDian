import { defineStore } from 'pinia';
import { ref } from 'vue';

type SaveHandler = (name: string) => Promise<void> | void;

export const useCategoryDialogStore = defineStore('category-dialog', () => {
  const visible = ref(false);
  const name = ref('');
  const message = ref('');
  const saving = ref(false);
  let saveHandler: SaveHandler = () => undefined;

  function open() {
    name.value = '';
    message.value = '';
    visible.value = true;
  }

  function close() {
    if (saving.value) return;
    visible.value = false;
    name.value = '';
    message.value = '';
  }

  function bindSave(handler: SaveHandler) {
    saveHandler = handler;
  }

  async function submit(): Promise<boolean> {
    if (saving.value) return false;
    saving.value = true;
    message.value = '';
    try {
      await saveHandler(name.value);
      visible.value = false;
      name.value = '';
      return true;
    } catch (error) {
      message.value = error instanceof Error ? error.message : '分类尚未保存';
      return false;
    } finally {
      saving.value = false;
    }
  }

  return { visible, name, message, saving, open, close, bindSave, submit };
});
