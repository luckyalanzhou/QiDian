import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useCreateMenuStore = defineStore('create-menu', () => {
  const visible = ref(false);
  const restoreFocusOnClose = ref(true);

  function open() {
    restoreFocusOnClose.value = true;
    visible.value = true;
  }

  function close() {
    visible.value = false;
  }

  function closeForNavigation() {
    restoreFocusOnClose.value = false;
    visible.value = false;
  }

  return { visible, restoreFocusOnClose, open, close, closeForNavigation };
});
