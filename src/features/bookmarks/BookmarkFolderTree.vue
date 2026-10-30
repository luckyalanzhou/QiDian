<script setup lang="ts">
import type { BookmarkAction, BookmarkFolderView } from './types';

defineProps<{ folders: BookmarkFolderView[]; depth?: number }>();
const emit = defineEmits<{ action: [action: BookmarkAction] }>();

function icon(name: string) {
  return `#i-${name}`;
}
</script>

<template>
  <li v-for="folder in folders" :key="folder.id">
    <div class="bookmark-folder-row" :style="{ '--bookmark-depth': Math.min(depth || 0, 6) }">
      <button
        v-if="folder.hasChildFolders"
        type="button"
        class="bookmark-disclosure"
        :aria-expanded="folder.expanded"
        :aria-controls="`bm-children-${folder.id}`"
        :aria-label="`${folder.expanded ? '折叠' : '展开'}${folder.title}`"
        @click="emit('action', { type: 'toggle-folder', id: folder.id })"
      >
        <span class="ico"><svg aria-hidden="true"><use :href="icon('chevron')" /></svg></span>
      </button>
      <span v-else class="bookmark-disclosure-spacer" />
      <button
        type="button"
        class="bookmark-folder-select"
        :class="{ active: folder.selected }"
        :aria-current="folder.selected ? 'page' : undefined"
        :aria-label="(depth || 0) >= 6 ? `第 ${(depth || 0) + 1} 层：${folder.title}` : undefined"
        :data-bm-folder="folder.id"
        @click="emit('action', { type: 'select-folder', id: folder.id })"
      >
        <span class="ico"><svg aria-hidden="true"><use :href="icon('folder')" /></svg></span>
        <small v-if="(depth || 0) >= 6" class="bookmark-folder-depth" aria-hidden="true">{{ (depth || 0) + 1 }}层</small>
        <span>{{ folder.title }}</span>
        <small>{{ folder.linkCount }}</small>
      </button>
    </div>
    <ul v-if="folder.hasChildFolders" :id="`bm-children-${folder.id}`" :hidden="!folder.expanded">
      <BookmarkFolderTree :folders="folder.children" :depth="(depth || 0) + 1" @action="emit('action', $event)" />
    </ul>
  </li>
</template>
