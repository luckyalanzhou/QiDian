<script setup lang="ts">
import type { BookmarkAction, BookmarkActionItem } from './types';

defineProps<{ item: BookmarkActionItem; organizing: boolean }>();
const emit = defineEmits<{ action: [action: BookmarkAction, event: MouseEvent] }>();

function send(action: BookmarkAction, event: MouseEvent) {
  emit('action', action, event);
}
</script>

<template>
  <details class="item-menu">
    <summary :aria-label="`更多：${item.title}`">···</summary>
    <div class="item-menu-panel">
      <template v-if="item.kind === 'folder'">
        <button type="button" aria-label="在此分组中添加子分组" @click="send({ type: 'add-folder', parentId: item.id }, $event)">添加子分组</button>
        <button type="button" aria-label="在此分组中添加书签" @click="send({ type: 'add-link', parentId: item.id }, $event)">添加书签</button>
      </template>
      <button v-else type="button" :aria-label="item.pinned ? '取消常用书签' : '设为常用书签'" :aria-pressed="item.pinned" @click="send({ type: 'toggle-pin', id: item.id }, $event)">
        {{ item.pinned ? '取消常用' : '设为常用' }}
      </button>
      <button type="button" :aria-label="item.kind === 'folder' ? '编辑分组' : '编辑或移动书签'" @click="send({ type: 'edit', id: item.id }, $event)">编辑 / 移动</button>
      <template v-if="organizing">
        <button type="button" :aria-label="item.kind === 'folder' ? '上移分组' : '上移书签'" :disabled="!item.canMoveUp" @click="send({ type: 'move', id: item.id, direction: 'up' }, $event)">上移</button>
        <button type="button" :aria-label="item.kind === 'folder' ? '下移分组' : '下移书签'" :disabled="!item.canMoveDown" @click="send({ type: 'move', id: item.id, direction: 'down' }, $event)">下移</button>
      </template>
      <button type="button" class="danger-btn" :aria-label="item.kind === 'folder' ? '删除分组' : '将书签移入回收站'" @click="send({ type: 'delete', id: item.id }, $event)">删除</button>
    </div>
  </details>
</template>
