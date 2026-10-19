<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useEditorStore } from './store';
import type { EditorAction } from './types';

const editor = useEditorStore();
const menu = ref<HTMLElement | null>(null);
const items = [
  { id: 'h2', symbol: 'H₂', label: '二级标题' },
  { id: 'h3', symbol: 'H₃', label: '三级标题' },
  { id: 'code', symbol: '</>', label: '代码块' },
  { id: 'image', symbol: '▧', label: '图片' },
  { id: 'table', symbol: '▦', label: '表格' },
  { id: 'ul', symbol: '☷', label: '无序列表' },
  { id: 'task', symbol: '☑', label: '待办清单' },
  { id: 'callout', symbol: '✦', label: '提示块' },
  { id: 'details', symbol: '▸', label: '折叠内容' },
  { id: 'emoji', symbol: '☺', label: '表情和符号' }
] as const;

function onDocumentClick(event: MouseEvent) {
  const target = event.target;
  if (target && !menu.value?.contains(target as Node)) editor.closeSlashMenu();
}

function choose(kind: string) {
  editor.closeSlashMenu();
  let action: EditorAction;
  if (kind === 'h2' || kind === 'h3') action = { group: 'format', action: 'formatBlock', value: kind };
  else if (kind === 'ul') action = { group: 'format', action: 'insertUnorderedList' };
  else if (kind === 'task') action = { group: 'format', action: 'toggleTaskList' };
  else action = { group: 'insert', action: kind as Extract<EditorAction, { group: 'insert' }>['action'] };
  void editor.dispatch(action);
}

onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="editor.slashMenu.visible"
      id="slashMenu"
      ref="menu"
      class="slash-menu open"
      role="menu"
      aria-label="插入内容块"
      :style="{ left: `${editor.slashMenu.left}px`, top: `${editor.slashMenu.top}px` }"
      @mousedown.prevent
      @click.stop
    >
      <div class="slash-caption">插入内容块</div>
      <button v-for="item in items" :key="item.id" type="button" role="menuitem" :data-slash="item.id" @click.stop="choose(item.id)">
        <span class="slash-symbol">{{ item.symbol }}</span>{{ item.label }}
      </button>
    </div>
  </Teleport>
</template>
