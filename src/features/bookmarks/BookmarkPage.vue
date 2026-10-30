<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useBookmarkStore } from './store';
import BookmarkActionsMenu from './BookmarkActionsMenu.vue';
import BookmarkBulkDialog from './BookmarkBulkDialog.vue';
import BookmarkDeleteDialog from './BookmarkDeleteDialog.vue';
import BookmarkEditDialog from './BookmarkEditDialog.vue';
import BookmarkFolderTree from './BookmarkFolderTree.vue';
import BookmarkImportDialog from './BookmarkImportDialog.vue';
import type { BookmarkAction, BookmarkLinkView } from './types';

const bookmarks = useBookmarkStore();
const selectAllInput = ref<HTMLInputElement | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const BOOKMARK_RENDER_BATCH_SIZE = 48;
const renderedLinkCounts = ref<Record<string, number>>({});

watch(
  () => [bookmarks.snapshot.query, bookmarks.snapshot.selectedFolder, bookmarks.snapshot.pinnedOnly].join('\u001f'),
  () => { renderedLinkCounts.value = {}; }
);

watch(() => bookmarks.snapshot.selection.indeterminate, async (indeterminate) => {
  await nextTick();
  if (selectAllInput.value) selectAllInput.value.indeterminate = indeterminate;
}, { immediate: true });

function dispatch(action: BookmarkAction) {
  if (action.type === 'import') importInput.value?.click();
  void bookmarks.dispatch(action);
}

function dispatchMenuAction(action: BookmarkAction, event: MouseEvent) {
  dispatch(action);
  const menu = (event.currentTarget as HTMLButtonElement).closest('details');
  if (menu) menu.open = false;
}

function icon(name: string) {
  return `#i-${name}`;
}

function handleLinkClick(event: MouseEvent, link: BookmarkLinkView) {
  if (!bookmarks.snapshot.organizing) return;
  event.preventDefault();
  dispatch({ type: 'select-link', id: link.id, selected: !link.selected });
}

function handleDirectoryToggle(event: Event) {
  dispatch({ type: 'toggle-directory', open: (event.currentTarget as HTMLDetailsElement).open });
}

function handleFaviconLoad(event: Event) {
  (event.currentTarget as HTMLImageElement).closest('.bookmark-site-icon')?.classList.add('has-favicon');
}

function handleFaviconError(event: Event) {
  (event.currentTarget as HTMLImageElement).remove();
}

function handleImportFile(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) void bookmarks.dispatch({ type: 'import-file', file });
}

function renderedLinkCount(section: { id: string; links: BookmarkLinkView[] }) {
  return Math.min(renderedLinkCounts.value[section.id] ?? BOOKMARK_RENDER_BATCH_SIZE, section.links.length);
}

function hasMoreLinks(section: { id: string; links: BookmarkLinkView[] }) {
  return renderedLinkCount(section) < section.links.length;
}

function showMoreLinks(section: { id: string; links: BookmarkLinkView[] }) {
  renderedLinkCounts.value = {
    ...renderedLinkCounts.value,
    [section.id]: Math.min(renderedLinkCount(section) + BOOKMARK_RENDER_BATCH_SIZE, section.links.length)
  };
}
</script>

<template>
  <Teleport to="#dashboardHost">
    <section v-if="bookmarks.active" class="bookmark-page" :class="{ 'is-organizing': bookmarks.snapshot.organizing }">
      <input ref="importInput" class="visually-hidden" type="file" accept=".html,.htm,text/html" aria-label="选择浏览器书签 HTML 文件" tabindex="-1" @change="handleImportFile">
      <header class="section-head workspace-page-head">
        <div>
          <h1>书签</h1>
          <p class="muted">{{ bookmarks.snapshot.bookmarkCount }} 个网址 · {{ bookmarks.snapshot.folderCount }} 个分组</p>
        </div>
        <div class="workspace-page-actions">
          <button class="secondary-btn bookmark-desktop-action" type="button" :aria-pressed="bookmarks.snapshot.organizing" @click="dispatch({ type: 'toggle-organizing' })">
            <span class="ico"><svg aria-hidden="true"><use :href="icon(bookmarks.snapshot.organizing ? 'check' : 'edit')" /></svg></span>
            {{ bookmarks.snapshot.organizing ? '完成整理' : '批量整理' }}
          </button>
          <button class="primary-btn bookmark-desktop-action" type="button" @click="dispatch({ type: 'add-link', parentId: bookmarks.snapshot.selectedFolder })">
            <span class="ico"><svg aria-hidden="true"><use :href="icon('plus')" /></svg></span>添加书签
          </button>
          <details class="item-menu bookmark-tools">
            <summary aria-label="书签更多操作">···</summary>
            <div class="item-menu-panel">
              <button class="bookmark-mobile-action" type="button" :aria-pressed="bookmarks.snapshot.organizing" @click="dispatchMenuAction({ type: 'toggle-organizing' }, $event)">{{ bookmarks.snapshot.organizing ? '完成整理' : '批量整理' }}</button>
              <button class="bookmark-mobile-action" type="button" @click="dispatchMenuAction({ type: 'add-link', parentId: bookmarks.snapshot.selectedFolder }, $event)">添加书签</button>
              <button type="button" @click="dispatch({ type: 'add-folder', parentId: bookmarks.snapshot.selectedFolder })">新建分组</button>
              <button type="button" @click="dispatch({ type: 'import' })">导入书签</button>
              <button type="button" @click="dispatch({ type: 'export' })">导出书签</button>
              <button type="button" class="danger-btn" :disabled="!bookmarks.snapshot.bookmarkCount" @click="dispatch({ type: 'clear' })">移入回收站</button>
            </div>
          </details>
        </div>
      </header>

      <div class="workspace-filter-bar">
        <label class="workspace-search">
          <span class="ico"><svg aria-hidden="true"><use :href="icon('search')" /></svg></span>
          <input type="search" placeholder="搜索名称、网址或分组" aria-label="搜索书签" :value="bookmarks.snapshot.query" @input="dispatch({ type: 'search', query: ($event.target as HTMLInputElement).value })">
        </label>
        <button class="secondary-btn" type="button" :aria-pressed="bookmarks.snapshot.pinnedOnly" @click="dispatch({ type: 'toggle-pinned' })">
          <span class="ico"><svg aria-hidden="true"><use :href="icon('heart')" /></svg></span>常用
        </button>
      </div>

      <div class="bookmark-browser">
        <details class="bookmark-directory" :open="bookmarks.snapshot.directoryOpen" @toggle="handleDirectoryToggle">
          <summary>
            <span class="ico"><svg aria-hidden="true"><use :href="icon('folder')" /></svg></span>
            <span>分组</span>
            <span class="bookmark-directory-path">{{ bookmarks.snapshot.selectedPath || '全部书签' }}</span>
            <span class="ico"><svg aria-hidden="true"><use :href="icon('chevron')" /></svg></span>
          </summary>
          <nav class="bookmark-folders" aria-label="书签分组">
            <button type="button" class="bookmark-folder-select" :class="{ active: !bookmarks.snapshot.selectedFolder }" :aria-current="!bookmarks.snapshot.selectedFolder ? 'page' : undefined" @click="dispatch({ type: 'select-folder', id: '' })">
              <span class="ico"><svg aria-hidden="true"><use :href="icon('link')" /></svg></span>全部书签
              <small>{{ bookmarks.snapshot.bookmarkCount }}</small>
            </button>
            <ul><BookmarkFolderTree :folders="bookmarks.snapshot.folders" @action="dispatch" /></ul>
            <p v-if="!bookmarks.snapshot.folders.length" class="hint bookmark-empty" role="status" aria-live="polite">暂无分组</p>
          </nav>
        </details>

        <div class="bookmark-results">
          <div v-if="bookmarks.snapshot.selectedFolder && bookmarks.snapshot.subgroups.length" class="bookmark-subgroups">
            <span>{{ bookmarks.snapshot.selectedPath }}</span>
            <button v-for="folder in bookmarks.snapshot.subgroups" :key="folder.id" type="button" @click="dispatch({ type: 'select-folder', id: folder.id })">
              <span class="ico"><svg aria-hidden="true"><use :href="icon('folder')" /></svg></span>{{ folder.title }}<small>{{ folder.linkCount }}</small>
            </button>
          </div>

          <div v-if="bookmarks.snapshot.organizing" class="bookmark-selection-bar">
            <label>
              <input ref="selectAllInput" type="checkbox" :checked="bookmarks.snapshot.selection.allSelected" :disabled="!bookmarks.snapshot.selection.visibleCount" @change="dispatch({ type: 'select-all', selected: ($event.target as HTMLInputElement).checked })">
              全选{{ bookmarks.snapshot.selection.scope }}
            </label>
            <span role="status">已选 {{ bookmarks.snapshot.selection.count }} / {{ bookmarks.snapshot.selection.visibleCount }} 项</span>
            <div>
              <button class="secondary-btn" type="button" :disabled="!bookmarks.snapshot.selection.count" @click="dispatch({ type: 'bulk-move' })">移动</button>
              <button class="secondary-btn danger-btn" type="button" :disabled="!bookmarks.snapshot.selection.count" @click="dispatch({ type: 'bulk-delete' })">删除所选</button>
            </div>
          </div>

          <template v-if="bookmarks.snapshot.sections.length">
            <section v-for="section in bookmarks.snapshot.sections" :key="section.id" class="bookmark-section" :class="{ 'bookmark-favorites': section.favorites }">
              <div class="bookmark-section-heading">
                <h2>
                  <span class="ico"><svg aria-hidden="true"><use :href="icon(section.favorites ? 'heart' : 'folder')" /></svg></span>
                  <span>{{ section.title }}</span><small>{{ section.count }}</small>
                </h2>
                <BookmarkActionsMenu v-if="section.folderAction" :item="section.folderAction" :organizing="bookmarks.snapshot.organizing" @action="dispatchMenuAction" />
              </div>
              <div v-if="section.links.length" class="bookmark-grid">
                <article v-for="link in section.links.slice(0, renderedLinkCount(section))" :key="link.id" class="bookmark-card" :class="{ 'is-selected': link.selected }">
                  <label v-if="bookmarks.snapshot.organizing" class="bookmark-checkbox">
                    <input type="checkbox" :checked="link.selected" :aria-label="`选择${link.title}`" @change="dispatch({ type: 'select-link', id: link.id, selected: ($event.target as HTMLInputElement).checked })">
                  </label>
                  <a :href="link.url" target="_blank" rel="noopener noreferrer" class="bookmark-link" :title="link.url" @click="handleLinkClick($event, link)">
                    <span class="bookmark-site-icon" :style="{ '--site-hue': link.hue }" aria-hidden="true">
                      <span class="bookmark-site-initials">{{ link.initials }}</span>
                      <img class="bookmark-site-favicon" :src="link.favicon" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" @load="handleFaviconLoad" @error="handleFaviconError">
                    </span>
                    <span class="bookmark-card-copy"><strong>{{ link.title }}</strong><small>{{ link.description || link.domain }}</small></span>
                    <span class="bookmark-link-arrow" aria-hidden="true"><span class="ico"><svg><use :href="icon('chevron')" /></svg></span></span>
                    <span v-if="link.pinned" class="bookmark-pin-mark" aria-label="常用书签"><span class="ico"><svg aria-hidden="true"><use :href="icon('heart')" /></svg></span></span>
                  </a>
                  <BookmarkActionsMenu :item="{ ...link, kind: 'link' }" :organizing="bookmarks.snapshot.organizing" @action="dispatchMenuAction" />
                </article>
              </div>
              <div v-if="section.links.length > BOOKMARK_RENDER_BATCH_SIZE" class="bookmark-load-more">
                <span role="status" aria-live="polite">已显示 {{ renderedLinkCount(section) }} / {{ section.links.length }} 个</span>
                <button v-if="hasMoreLinks(section)" class="secondary-btn" type="button" @click="showMoreLinks(section)">加载更多</button>
              </div>
              <p v-if="!section.links.length" class="bookmark-empty hint" role="status" aria-live="polite">{{ section.emptyMessage || '暂无书签' }}</p>
            </section>
          </template>
          <div v-else class="empty" role="status" aria-live="polite">{{ bookmarks.snapshot.emptyMessage }}</div>
        </div>
      </div>
    </section>
  </Teleport>
  <BookmarkEditDialog />
  <BookmarkDeleteDialog />
  <BookmarkBulkDialog />
  <BookmarkImportDialog />
</template>
