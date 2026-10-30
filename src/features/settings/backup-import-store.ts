import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useBackupImportStore = defineStore('backup-import', () => {
  const active = ref(false);
  const stage = ref('');
  const current = ref(0);
  const total = ref(0);

  function begin() {
    active.value = true;
    stage.value = '正在准备导入';
    current.value = 0;
    total.value = 0;
  }

  function setProgress(progress: { stage: string; current?: number; total?: number }) {
    if (!active.value) return;
    stage.value = progress.stage;
    current.value = Number.isSafeInteger(progress.current) ? Math.max(0, progress.current!) : 0;
    total.value = Number.isSafeInteger(progress.total) ? Math.max(0, progress.total!) : 0;
  }

  function finish() {
    active.value = false;
    stage.value = '';
    current.value = 0;
    total.value = 0;
  }

  return { active, stage, current, total, begin, setProgress, finish };
});
