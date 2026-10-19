<script setup lang="ts">
import type { BookmarkAction, BookmarkActionItem } from './types';

defineProps<{ item: BookmarkActionItem; organizing: boolean }>();
const emit = defineEmits<{ action: [action: BookmarkAction] }>();

function send(action: BookmarkAction) {
  emit('action', action);
}
</script>

<template>
  <details class="item-menu">
    <summary :aria-label="`更多：${item.title}`">···</summary>
    <div class="item-menu-panel">
      <template v-if="item.kind === 'folder'">
        <button type="button" @click="send({ type: 'add-folder', parentId: item.id })">添加子分组</button>
        <button type="button" @click="send({ type: 'add-link', parentId: item.id })">添加书签</button>
      </template>
      <button v-else type="button" :aria-pressed="item.pinned" @click="send({ type: 'toggle-pin', id: item.id })">
        {{ item.pinned ? '取消常用' : '设为常用' }}
      </button>
      <button type="button" @click="send({ type: 'edit', id: item.id })">编辑 / 移动</button>
      <template v-if="organizing">
        <button type="button" :disabled="!item.canMoveUp" @click="send({ type: 'move', id: item.id, direction: 'up' })">上移</button>
        <button type="button" :disabled="!item.canMoveDown" @click="send({ type: 'move', id: item.id, direction: 'down' })">下移</button>
      </template>
      <button type="button" class="danger-btn" @click="send({ type: 'delete', id: item.id })">删除</button>
    </div>
  </details>
</template>
