<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useBookmarkStore } from './store';
import { watchDialogFocusReturn } from '../dialogs/dialog-focus-return';

const bookmarks = useBookmarkStore();
const cancelButton = ref<HTMLButtonElement | null>(null);
const dialog = ref<HTMLElement | null>(null);
watchDialogFocusReturn(() => !!bookmarks.importDialog, () => document.querySelector<HTMLElement>('#dashboardHost input[aria-label="搜索书签"]'));

watch(() => bookmarks.importDialog ? 'open' : '', async open => {
  if (!open) return;
  await nextTick();
  cancelButton.value?.focus({ preventScroll: true });
});

function confirm() {
  void bookmarks.dispatch({ type: 'confirm-import' });
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    bookmarks.closeImportDialog();
    return;
  }

  if (event.key !== 'Tab' || !dialog.value) return;
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>('*')].filter(element =>
    element.matches('button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')
      && !element.hidden
      && element.getAttribute('aria-hidden') !== 'true'
  );
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.value.focus({ preventScroll: true });
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !dialog.value.contains(active))) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && (active === last || !dialog.value.contains(active))) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="bookmarks.importDialog" id="bookmarkImportOverlay" class="overlay open" @mousedown.self="bookmarks.closeImportDialog" @keydown="onKeydown">
      <section ref="dialog" class="dialog type-dialog" role="dialog" aria-modal="true" aria-labelledby="bookmarkImportTitle" aria-describedby="bookmarkImportMessage" tabindex="-1">
        <div class="dialog-head">
          <h2 id="bookmarkImportTitle">导入书签</h2>
          <button class="round-btn" type="button" aria-label="关闭" :disabled="bookmarks.importDialog.saving" @click="bookmarks.closeImportDialog">×</button>
        </div>
        <div class="dialog-body">
          <p id="bookmarkImportMessage">新增 {{ bookmarks.importDialog.added }} 个书签 · 跳过 {{ bookmarks.importDialog.duplicates }} 个重复项<span v-if="bookmarks.importDialog.skipped"> · 忽略 {{ bookmarks.importDialog.skipped }} 个不支持的网址</span></p>
          <p class="hint">保留分组层级与顺序，同名分组合并。</p>
          <div class="bookmark-import-preview" aria-label="导入分组预览">
            <div v-for="folder in bookmarks.importDialog.folders" :key="folder.id">{{ folder.path }}</div>
            <span v-if="!bookmarks.importDialog.folders.length">根目录书签</span>
          </div>
          <p v-if="bookmarks.importDialog.error" class="hint error" role="alert" aria-live="polite">{{ bookmarks.importDialog.error }}</p>
        </div>
        <div class="dialog-foot">
          <button ref="cancelButton" class="secondary-btn" type="button" :disabled="bookmarks.importDialog.saving" @click="bookmarks.closeImportDialog">取消</button>
          <button class="primary-btn" type="button" :disabled="bookmarks.importDialog.saving" @click="confirm">{{ bookmarks.importDialog.saving ? '导入中…' : '导入书签' }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
