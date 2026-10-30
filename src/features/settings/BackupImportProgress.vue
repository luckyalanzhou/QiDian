<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { firstRestorableFocusTarget, watchDialogFocusReturn } from '../dialogs/dialog-focus-return';
import { useBackupImportStore } from './backup-import-store';

const store = useBackupImportStore();
const dialog = ref<HTMLElement | null>(null);

watchDialogFocusReturn(
  () => store.active,
  () => firstRestorableFocusTarget(document.querySelectorAll<HTMLElement>('#accountButton, #menuBtn, #searchTop, #mobileSearch'))
);

watch(() => store.active, async active => {
  if (!active) return;
  await nextTick();
  dialog.value?.focus();
});
</script>

<template>
  <div v-if="store.active" class="overlay open backup-import-overlay" @keydown.capture.stop.prevent>
    <section ref="dialog" class="dialog backup-import-dialog" role="alertdialog" aria-modal="true"
      aria-labelledby="backupImportTitle" aria-describedby="backupImportStage" tabindex="-1">
      <div class="dialog-head">
        <h2 id="backupImportTitle">{{ store.stage === '正在验证备份文件' ? '正在验证备份' : '正在导入备份' }}</h2>
      </div>
      <div class="dialog-body">
        <p id="backupImportStage" aria-live="polite">{{ store.stage }}</p>
        <progress v-if="store.total > 0" :value="store.current" :max="store.total" aria-label="附件处理进度" />
        <span v-if="store.total > 0" class="backup-import-count">{{ store.current }} / {{ store.total }}</span>
      </div>
    </section>
  </div>
</template>
