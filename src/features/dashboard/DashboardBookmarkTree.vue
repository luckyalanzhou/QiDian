<script setup lang="ts">
import { computed, ref } from 'vue';
import type { DashboardBookmarkFolder, DashboardBookmarkNode } from './store';
import { useDashboardStore } from './store';

defineOptions({ name: 'DashboardBookmarkTree' });

const props = defineProps<{ item: DashboardBookmarkNode; depth: number }>();
const dashboard = useDashboardStore();
const RENDER_BATCH_SIZE = 48;
const renderedChildCounts = ref<Record<string, number>>({});
const folder = computed(() => props.item.kind === 'folder' ? props.item as DashboardBookmarkFolder : null);
const link = computed(() => props.item.kind === 'link' ? props.item : null);
const isOpen = computed(() => {
  if (!folder.value) return false;
  return dashboard.snapshot.folderStates[folder.value.id] ?? folder.value.defaultOpen;
});

function toggleFolder() {
  if (!folder.value) return;
  const open = !isOpen.value;
  dashboard.saveFolder(folder.value.id, open);
}

function renderedChildCount(value: DashboardBookmarkFolder) {
  return Math.min(renderedChildCounts.value[value.id] ?? RENDER_BATCH_SIZE, value.children.length);
}

function showMoreChildren(value: DashboardBookmarkFolder) {
  renderedChildCounts.value = {
    ...renderedChildCounts.value,
    [value.id]: Math.min(renderedChildCount(value) + RENDER_BATCH_SIZE, value.children.length)
  };
}

function icon(name: string) {
  return `#i-${name}`;
}
</script>

<template>
  <details v-if="folder" :class="depth ? 'dashboard-bookmark-branch' : 'dashboard-bookmark-card'" :data-dashboard-folder="folder.id" :open="isOpen">
    <summary class="dashboard-bookmark-group" :data-dashboard-bookmark-folder="folder.id" :aria-expanded="isOpen" @click.prevent.stop="toggleFolder">
      <span class="dashboard-group-icon"><span class="ico"><svg aria-hidden="true"><use :href="icon('folder')" /></svg></span></span>
      <span class="dashboard-group-copy">
        <strong>{{ folder.title }}</strong>
        <small>{{ folder.linkCount }} 个网址</small>
      </span>
      <span class="ico"><svg aria-hidden="true"><use :href="icon('chevron')" /></svg></span>
    </summary>
    <div v-if="isOpen" class="dashboard-bookmark-children">
      <template v-if="folder.children.length">
        <DashboardBookmarkTree v-for="child in folder.children.slice(0, renderedChildCount(folder))" :key="child.id" :item="child" :depth="depth + 1" />
        <div v-if="folder.children.length > RENDER_BATCH_SIZE" class="bookmark-load-more">
          <span role="status" aria-live="polite">已显示 {{ renderedChildCount(folder) }} / {{ folder.children.length }} 项</span>
          <button v-if="renderedChildCount(folder) < folder.children.length" class="secondary-btn" type="button" :aria-label="`加载${folder.title}中的更多内容`" @click.stop="showMoreChildren(folder)">加载更多</button>
        </div>
      </template>
      <p v-else class="dashboard-folder-empty">暂无书签</p>
    </div>
  </details>
  <a v-else-if="link" class="dashboard-bookmark-preview-link" :href="link.url" target="_blank" rel="noopener noreferrer" :title="link.url">
    <span class="dashboard-preview-icon"><span class="ico"><svg aria-hidden="true"><use :href="icon('link')" /></svg></span></span>
    <span class="dashboard-preview-copy">
      <strong>{{ link.title }}</strong>
      <small>{{ link.path }}</small>
    </span>
  </a>
</template>
