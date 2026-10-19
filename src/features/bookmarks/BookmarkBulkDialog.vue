<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { bookmarkFolderPaths } from './snapshot';
import { useBookmarkStore } from './store';
import { useVaultStore } from '../vault/store';

const bookmarks = useBookmarkStore();
const vault = useVaultStore();
const targetInput = ref<HTMLSelectElement | null>(null);
const folders = () => bookmarkFolderPaths(vault.value?.bookmarks || []);

watch(() => bookmarks.bulkDialog?.mode || '', async mode => {
  if (!mode) return;
  await nextTick();
  targetInput.value?.focus();
});

function confirm() {
  void bookmarks.dispatch({ type: 'confirm-bulk' });
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  bookmarks.closeBulkDialog();
}
</script>

<template>
  <Teleport to="body">
    <div v-if="bookmarks.bulkDialog" id="bookmarkBulkOverlay" class="overlay open" @mousedown.self="bookmarks.closeBulkDialog" @keydown="onKeydown">
      <section class="dialog type-dialog" role="dialog" aria-modal="true" aria-labelledby="bookmarkBulkTitle" aria-describedby="bookmarkBulkMessage" tabindex="-1">
        <div class="dialog-head">
          <h2 id="bookmarkBulkTitle">{{ bookmarks.bulkDialog.mode === 'move' ? '移动书签' : '移入回收站' }}</h2>
          <button class="round-btn" type="button" aria-label="关闭" :disabled="bookmarks.bulkDialog.saving" @click="bookmarks.closeBulkDialog">×</button>
        </div>
        <div class="dialog-body">
          <p id="bookmarkBulkMessage" v-if="bookmarks.bulkDialog.mode === 'move'">移动选中的 {{ bookmarks.bulkDialog.ids.length }} 个网址。</p>
          <p id="bookmarkBulkMessage" v-else>将选中的 {{ bookmarks.bulkDialog.ids.length }} 个网址移入回收站，分组和未选书签保留；可在 30 天内还原。</p>
          <template v-if="bookmarks.bulkDialog.mode === 'move'">
            <label class="form-label" for="bookmarkBulkTarget">目标分组</label>
            <select id="bookmarkBulkTarget" ref="targetInput" class="form-text" :value="bookmarks.bulkDialog.targetId" :disabled="bookmarks.bulkDialog.saving" @change="bookmarks.bulkDialog.targetId = ($event.target as HTMLSelectElement).value">
              <option value="">书签根目录</option>
              <option v-for="folder in folders()" :key="folder.id" :value="folder.id">{{ folder.path }}</option>
            </select>
          </template>
          <p v-if="bookmarks.bulkDialog.error" class="hint error" role="alert" aria-live="polite">{{ bookmarks.bulkDialog.error }}</p>
        </div>
        <div class="dialog-foot">
          <button class="secondary-btn" type="button" :disabled="bookmarks.bulkDialog.saving" @click="bookmarks.closeBulkDialog">取消</button>
          <button class="primary-btn" :class="{ 'danger-btn': bookmarks.bulkDialog.mode === 'delete' }" type="button" :disabled="bookmarks.bulkDialog.saving" @click="confirm">{{ bookmarks.bulkDialog.saving ? '处理中…' : bookmarks.bulkDialog.mode === 'move' ? '移动' : '移入回收站' }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
