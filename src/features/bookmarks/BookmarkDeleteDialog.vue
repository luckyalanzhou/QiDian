<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useBookmarkStore } from './store';

const bookmarks = useBookmarkStore();
const modeInput = ref<HTMLSelectElement | null>(null);

watch(() => bookmarks.deleteDialog?.request.kind || '', async kind => {
  if (!kind) return;
  await nextTick();
  modeInput.value?.focus();
});

function confirm() {
  void bookmarks.dispatch({ type: 'confirm-delete' });
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  bookmarks.closeDeleteDialog();
}
</script>

<template>
  <Teleport to="body">
    <div v-if="bookmarks.deleteDialog" id="bookmarkDeleteOverlay" class="overlay open" @mousedown.self="bookmarks.closeDeleteDialog" @keydown="onKeydown">
      <section class="dialog type-dialog" role="alertdialog" aria-modal="true" aria-labelledby="bookmarkDeleteTitle" aria-describedby="bookmarkDeleteMessage" tabindex="-1">
        <div class="dialog-head">
          <h2 id="bookmarkDeleteTitle">{{ bookmarks.deleteDialog.request.kind === 'all' ? '移入回收站' : bookmarks.deleteDialog.request.itemKind === 'folder' ? '删除分组' : '删除书签' }}</h2>
          <button class="round-btn" type="button" aria-label="关闭" :disabled="bookmarks.deleteDialog.saving" @click="bookmarks.closeDeleteDialog">×</button>
        </div>
        <div class="dialog-body">
          <p id="bookmarkDeleteMessage" v-if="bookmarks.deleteDialog.request.kind === 'all'">
            将 {{ bookmarks.deleteDialog.request.linkCount }} 个网址和 {{ bookmarks.deleteDialog.request.folderCount }} 个分组移入回收站，可在 30 天内还原。笔记不会删除。
          </p>
          <template v-else>
            <p>将“{{ bookmarks.deleteDialog.request.title }}”移入回收站，可在 30 天内还原。</p>
            <template v-if="bookmarks.deleteDialog.request.hasChildren">
              <label class="form-label" for="bookmarkDeleteMode">分组内容</label>
              <select id="bookmarkDeleteMode" ref="modeInput" class="form-text" :value="bookmarks.deleteDialog.mode" :disabled="bookmarks.deleteDialog.saving" @change="bookmarks.deleteDialog.mode = ($event.target as HTMLSelectElement).value as 'keep' | 'delete'">
                <option value="keep">保留内容，移到上一级</option>
                <option value="delete">连同所有子分组和书签一起移入</option>
              </select>
            </template>
          </template>
          <p v-if="bookmarks.deleteDialog.error" class="hint error" role="alert" aria-live="polite">{{ bookmarks.deleteDialog.error }}</p>
        </div>
        <div class="dialog-foot">
          <button class="secondary-btn" type="button" :disabled="bookmarks.deleteDialog.saving" @click="bookmarks.closeDeleteDialog">取消</button>
          <button class="primary-btn danger-btn" type="button" :disabled="bookmarks.deleteDialog.saving" @click="confirm">{{ bookmarks.deleteDialog.saving ? '处理中…' : '移入回收站' }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
