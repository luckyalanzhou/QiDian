<script setup lang="ts">
import type { GlobalSearchFilter } from './store';
import type { GlobalSearchSnapshot } from './snapshot';

defineProps<{
  snapshot: GlobalSearchSnapshot;
  query: string;
  filter: GlobalSearchFilter;
  returnContext: { id: string; query: string; scrollTop: number } | null;
}>();

const emit = defineEmits<{
  'open-note': [id: string];
  'open-bookmark': [];
  filter: [value: GlobalSearchFilter];
  'load-more': [kind: 'notes' | 'bookmarks'];
}>();

function snippetParts(query: string, snippet: string) {
  const normalizedQuery = query.trim();
  const index = snippet.toLocaleLowerCase().indexOf(normalizedQuery.toLocaleLowerCase());
  if (!normalizedQuery || index < 0) return { before: snippet, match: '', after: '' };
  return {
    before: snippet.slice(0, index),
    match: snippet.slice(index, index + normalizedQuery.length),
    after: snippet.slice(index + normalizedQuery.length)
  };
}
</script>

<template>
  <div class="switcher-filters" role="group" aria-label="筛选搜索结果">
    <button v-for="item in [{ id: 'all', label: '全部' }, { id: 'notes', label: '笔记' }, { id: 'bookmarks', label: '书签' }] as const" :key="item.id" type="button" :aria-pressed="filter === item.id" :class="{ selected: filter === item.id }" @click="emit('filter', item.id)">{{ item.label }}</button>
  </div>
  <h3 v-if="filter !== 'bookmarks' && snapshot.notes.length" class="switcher-group-title">笔记</h3>
  <button
    v-for="note in snapshot.notes"
    :key="`note-${note.id}`"
    class="switcher-item"
    :class="{ 'switcher-item-current': returnContext?.id === note.id }"
    :aria-current="returnContext?.id === note.id ? 'true' : undefined"
    type="button"
    :data-search-id="note.id"
    @click.stop="emit('open-note', note.id)"
  >
    <strong class="switcher-title">{{ note.title }}</strong>
    <span v-if="note.snippet" class="switcher-snippet">{{ snippetParts(query, note.snippet).before }}<mark v-if="snippetParts(query, note.snippet).match">{{ snippetParts(query, note.snippet).match }}</mark>{{ snippetParts(query, note.snippet).after }}</span>
    <small class="switcher-meta">{{ note.typeLabel }} · {{ note.updatedLabel }}</small>
  </button>
  <button v-if="filter !== 'bookmarks' && snapshot.hasMoreNotes" class="switcher-load-more" type="button" @click="emit('load-more', 'notes')">显示更多笔记</button>
  <h3 v-if="filter !== 'notes' && snapshot.bookmarks.length" class="switcher-group-title">书签</h3>
  <a
    v-for="bookmark in snapshot.bookmarks"
    :key="`bookmark-${bookmark.id}`"
    class="switcher-item"
    :href="bookmark.url"
    target="_blank"
    rel="noopener noreferrer"
    data-search-bookmark
    @click.stop="emit('open-bookmark')"
  >
    <strong class="switcher-title">{{ bookmark.title }}</strong>
    <small class="switcher-meta">{{ bookmark.path || '未分组' }} · {{ bookmark.hostname }}</small>
  </a>
  <button v-if="filter !== 'notes' && snapshot.hasMoreBookmarks" class="switcher-load-more" type="button" @click="emit('load-more', 'bookmarks')">显示更多书签</button>
  <div v-if="!snapshot.notes.length && !snapshot.bookmarks.length" class="empty" style="padding:25px" role="status" aria-live="polite">
    {{ query.trim() ? '没有找到匹配的内容' : '还没有可搜索的内容。添加笔记或书签后，即可在这里搜索。' }}
  </div>
</template>
