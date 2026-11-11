<script setup lang="ts">
import type { NoteCardItem } from './types';
import { useNavigationActionsStore } from '../navigation/navigation-actions-store';
import { useWorkspaceShellActionsStore } from '../navigation/workspace-shell-actions-store';

defineProps<{ note: NoteCardItem }>();
const navigationActions = useNavigationActionsStore();
const shellActions = useWorkspaceShellActionsStore();
</script>

<template>
  <article class="note-card note-row-card">
    <div class="note-card-open note-row-open" :data-open="note.id" role="button" tabindex="0" :aria-label="`打开笔记：${note.title || '无标题笔记'}`" @click.stop="navigationActions.execute({ type: 'open-note', id: note.id })">
      <h3><span v-if="note.pinned" title="已收藏">★ </span>{{ note.title || '无标题笔记' }}</h3>
      <span class="note-row-type">{{ note.typeName }}</span>
      <span class="note-row-tags">
        <span v-for="tag in note.tags.slice(0, 2)" :key="tag" class="tag">#{{ tag }}</span>
        <span v-if="note.tags.length > 2" :title="note.tags.slice(2).join('、')">+{{ note.tags.length - 2 }}</span>
      </span>
      <span class="date">{{ note.updatedLabel }}</span>
    </div>
    <details class="item-menu note-item-menu">
      <summary :aria-label="`更多：${note.title || '无标题笔记'}`">···</summary>
      <div class="item-menu-panel">
        <button type="button" :data-note-edit="note.id" @click.stop="navigationActions.execute({ type: 'open-note', id: note.id, forceEdit: true })">编辑</button>
        <button type="button" class="danger-btn" :data-note-delete="note.id" @click.stop="shellActions.execute({ type: 'delete-note', id: note.id })">删除</button>
      </div>
    </details>
  </article>
</template>
