<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useBookmarkStore } from './store';

const bookmarks = useBookmarkStore();
const confirmButton = ref<HTMLButtonElement | null>(null);

watch(() => bookmarks.importDialog ? 'open' : '', async open => {
  if (!open) return;
  await nextTick();
  confirmButton.value?.focus();
});

function confirm() {
  void bookmarks.dispatch({ type: 'confirm-import' });
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  bookmarks.closeImportDialog();
}
</script>

<template>
  <Teleport to="body">
    <div v-if="bookmarks.importDialog" id="bookmarkImportOverlay" class="overlay open" @mousedown.self="bookmarks.closeImportDialog" @keydown="onKeydown">
      <section class="dialog type-dialog" role="dialog" aria-modal="true" aria-labelledby="bookmarkImportTitle" aria-describedby="bookmarkImportMessage" tabindex="-1">
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
          <button class="secondary-btn" type="button" :disabled="bookmarks.importDialog.saving" @click="bookmarks.closeImportDialog">取消</button>
          <button ref="confirmButton" class="primary-btn" type="button" :disabled="bookmarks.importDialog.saving" @click="confirm">{{ bookmarks.importDialog.saving ? '导入中…' : '导入书签' }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
