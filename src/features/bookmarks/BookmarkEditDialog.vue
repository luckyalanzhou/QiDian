<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { bookmarkFolderPaths } from './snapshot';
import { useBookmarkStore } from './store';
import { useVaultStore } from '../vault/store';

const bookmarks = useBookmarkStore();
const vault = useVaultStore();
const titleInput = ref<HTMLInputElement | null>(null);
const parentOptions = () => {
  const form = bookmarks.editor;
  const folders = bookmarkFolderPaths(vault.value?.bookmarks || [], '', form?.kind === 'folder' ? form.id : '');
  return folders;
};

watch(() => bookmarks.editor ? `${bookmarks.editor.kind}:${bookmarks.editor.id || 'new'}` : '', async identity => {
  if (!identity) return;
  await nextTick();
  titleInput.value?.focus();
  titleInput.value?.select();
});

function submit(event: SubmitEvent) {
  event.preventDefault();
  void bookmarks.dispatch({ type: 'save-editor' });
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  bookmarks.closeEditor();
}
</script>

<template>
  <Teleport to="body">
    <div v-if="bookmarks.editor" id="bookmarkEditOverlay" class="overlay open" @mousedown.self="bookmarks.closeEditor" @keydown="onKeydown">
      <section class="dialog type-dialog" role="dialog" aria-modal="true" aria-labelledby="bookmarkEditTitle" aria-describedby="bookmarkEditMessage" tabindex="-1">
        <div class="dialog-head">
          <h2 id="bookmarkEditTitle">{{ bookmarks.editor.id ? '编辑' : '添加' }}{{ bookmarks.editor.kind === 'folder' ? '分组' : '书签' }}</h2>
          <button class="round-btn" type="button" aria-label="关闭" :disabled="bookmarks.editor.saving" @click="bookmarks.closeEditor">×</button>
        </div>
        <form @submit="submit">
          <div class="dialog-body">
            <label class="form-label" for="bookmarkEditName">名称</label>
            <input
              id="bookmarkEditName"
              ref="titleInput"
              class="form-text"
              type="text"
              maxlength="500"
              required
              :value="bookmarks.editor.title"
              :disabled="bookmarks.editor.saving"
              @input="bookmarks.editor.title = ($event.target as HTMLInputElement).value"
            >
            <template v-if="bookmarks.editor.kind === 'link'">
              <label class="form-label" for="bookmarkEditUrl">网址</label>
              <input
                id="bookmarkEditUrl"
                class="form-text"
                type="url"
                maxlength="2048"
                placeholder="https://example.com"
                required
                :value="bookmarks.editor.url"
                :disabled="bookmarks.editor.saving"
                @input="bookmarks.editor.url = ($event.target as HTMLInputElement).value"
              >
            </template>
            <label class="form-label" for="bookmarkEditParent">分组</label>
            <select
              id="bookmarkEditParent"
              class="form-text"
              :value="bookmarks.editor.parentId"
              :disabled="bookmarks.editor.saving"
              @change="bookmarks.editor.parentId = ($event.target as HTMLSelectElement).value"
            >
              <option value="">书签根目录</option>
              <option v-for="folder in parentOptions()" :key="folder.id" :value="folder.id">{{ folder.path }}</option>
            </select>
            <p id="bookmarkEditMessage" class="hint" :class="{ error: bookmarks.editor.error }" role="alert" aria-live="polite">{{ bookmarks.editor.error }}</p>
          </div>
          <div class="dialog-foot">
            <button class="secondary-btn" type="button" :disabled="bookmarks.editor.saving" @click="bookmarks.closeEditor">取消</button>
            <button class="primary-btn" type="submit" :disabled="bookmarks.editor.saving">{{ bookmarks.editor.saving ? '保存中…' : '保存' }}</button>
          </div>
        </form>
      </section>
    </div>
  </Teleport>
</template>
