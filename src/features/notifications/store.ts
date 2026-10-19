import { defineStore } from 'pinia';

export const useToastStore = defineStore('notifications', {
  state: () => ({
    message: '',
    visible: false,
    revision: 0
  }),
  actions: {
    show(message: unknown) {
      const text = String(message ?? '');
      if (!text) return;
      this.message = text;
      this.visible = true;
      this.revision += 1;
    },
    dismiss() {
      this.visible = false;
      this.message = '';
    }
  }
});
