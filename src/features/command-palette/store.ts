import { defineStore } from 'pinia';

export const useCommandPaletteStore = defineStore('command-palette', {
  state: () => ({
    open: false,
    query: '',
    activeIndex: 0
  }),
  actions: {
    toggle() {
      if (this.open) {
        this.close();
        return;
      }
      this.query = '';
      this.activeIndex = 0;
      this.open = true;
    },
    close() {
      this.open = false;
      this.query = '';
      this.activeIndex = 0;
    },
    setQuery(query: string) {
      this.query = query;
      this.activeIndex = 0;
    },
    setActiveIndex(index: number, count: number) {
      if (!count) {
        this.activeIndex = 0;
        return;
      }
      this.activeIndex = (index + count) % count;
    }
  }
});
