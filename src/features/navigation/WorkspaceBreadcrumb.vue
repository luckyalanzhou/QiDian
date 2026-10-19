<script setup lang="ts">
import { computed } from 'vue';
import { useEditorStore } from '../editor/store';
import { useNoteListStore } from '../notes/store';
import { useReaderStore } from '../reader/store';
import { useNavigationStore } from './store';

const navigation = useNavigationStore();
const notes = useNoteListStore();
const editor = useEditorStore();
const reader = useReaderStore();
const title = computed(() => {
  switch (navigation.page) {
    case 'dashboard': return '首页';
    case 'home': return notes.snapshot.heading;
    case 'bookmarks': return '书签导航';
    case 'trash': return '回收站';
    case 'note': return navigation.editing ? editor.form.title.trim() || '新建笔记' : reader.snapshot.title || '阅读笔记';
  }
});

</script>

<template>
  <Teleport to="#breadcrumbTitleIsland">
    <span class="breadcrumb-root" :hidden="title === '首页'">我的空间</span>
    <span class="breadcrumb-separator" aria-hidden="true" :hidden="title === '首页'"> / </span>
    <strong id="breadcrumbTitle">{{ title }}</strong>
  </Teleport>
</template>
