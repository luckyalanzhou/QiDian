import { defineStore } from 'pinia';
import { markRaw } from 'vue';
import type { VaultData } from '../../../shared/api-contracts.js';

export const useVaultStore = defineStore('vault-data', {
  state: () => ({
    value: null as VaultData | null,
    generation: 0
  }),
  getters: {
    ready: state => state.value !== null
  },
  actions: {
    replace(value: VaultData): VaultData {
      const snapshot = markRaw(value);
      this.value = snapshot;
      this.generation += 1;
      return snapshot;
    },
    mutate<T>(operation: (value: VaultData) => T): T {
      if (!this.value) throw new Error('知识库尚未加载');
      try {
        return operation(this.value);
      } finally {
        this.generation += 1;
      }
    },
    snapshot(): VaultData {
      if (!this.value) throw new Error('知识库尚未加载');
      return structuredClone(this.value);
    }
  }
});
