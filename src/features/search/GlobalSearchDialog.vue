<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useGlobalSearchStore } from './store';
import { useNavigationActionsStore } from '../navigation/navigation-actions-store';
import { firstRestorableFocusTarget } from '../dialogs/dialog-focus-return';

const store = useGlobalSearchStore();
const navigationActions = useNavigationActionsStore();
const searchLayer = ref<HTMLElement | null>(null);
const dialog = ref<HTMLElement | null>(null);
const input = ref<HTMLInputElement | null>(null);
const returnFocus = ref<HTMLElement | null>(null);
let restoreFocusOnClose = false;
let searchHistoryEntryOpen = false;
let searchHistoryClosePending = false;
let visualViewport: VisualViewport | null = null;

function syncSearchViewport() {
  const layer = searchLayer.value;
  if (!layer) return;

  layer.style.setProperty('--search-viewport-top', `${window.visualViewport?.offsetTop ?? 0}px`);
  layer.style.setProperty('--search-viewport-height', `${window.visualViewport?.height ?? window.innerHeight}px`);
}

function startSearchViewportTracking() {
  syncSearchViewport();
  visualViewport = window.visualViewport ?? null;
  visualViewport?.addEventListener('resize', syncSearchViewport);
  visualViewport?.addEventListener('scroll', syncSearchViewport);
  window.addEventListener('resize', syncSearchViewport);
}

function stopSearchViewportTracking() {
  visualViewport?.removeEventListener('resize', syncSearchViewport);
  visualViewport?.removeEventListener('scroll', syncSearchViewport);
  visualViewport = null;
  window.removeEventListener('resize', syncSearchViewport);
}

function hasSearchHistoryEntry(state: unknown): boolean {
  return !!state && typeof state === 'object'
    && (state as { qidianSearchOverlay?: unknown }).qidianSearchOverlay === true;
}

function openSearchHistoryEntry() {
  if (searchHistoryClosePending) return;

  const currentState = window.history.state;
  if (hasSearchHistoryEntry(currentState)) {
    searchHistoryEntryOpen = true;
    return;
  }

  window.history.pushState({
    ...(currentState && typeof currentState === 'object' ? currentState : {}),
    qidianSearchOverlay: true
  }, '', window.location.href);
  searchHistoryEntryOpen = true;
}

function closeSearchHistoryEntry() {
  if (!searchHistoryEntryOpen || !hasSearchHistoryEntry(window.history.state)) {
    searchHistoryEntryOpen = false;
    return;
  }

  searchHistoryEntryOpen = false;
  searchHistoryClosePending = true;
  window.history.back();
}

function handleSearchPopState(event: PopStateEvent) {
  const isSearchEntry = hasSearchHistoryEntry(event.state);
  if (searchHistoryClosePending) {
    searchHistoryClosePending = false;
    if (store.open) {
      openSearchHistoryEntry();
      event.stopImmediatePropagation();
      return;
    }
  }

  if (isSearchEntry) {
    searchHistoryEntryOpen = true;
    if (!store.open) store.show(store.query, document.activeElement instanceof HTMLElement ? document.activeElement : null);
    event.stopImmediatePropagation();
    return;
  }

  if (!searchHistoryEntryOpen) return;
  searchHistoryEntryOpen = false;
  if (store.open) store.close();
  event.stopImmediatePropagation();
}

onMounted(() => window.addEventListener('popstate', handleSearchPopState, true));
onBeforeUnmount(() => {
  window.removeEventListener('popstate', handleSearchPopState, true);
  stopSearchViewportTracking();
});

watch(() => store.open, async open => {
  if (open) {
    openSearchHistoryEntry();
    returnFocus.value = store.consumeFocusReturnTarget()
      || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    await nextTick();
    startSearchViewportTracking();
    input.value?.focus();
    return;
  }

  stopSearchViewportTracking();
  if (restoreFocusOnClose) {
    const fallbackTargets = document.querySelectorAll<HTMLElement>('#searchTop, #mobileSearch, #menuBtn, #accountButton');
    firstRestorableFocusTarget([
      ...(returnFocus.value ? [returnFocus.value] : []),
      ...fallbackTargets
    ])?.focus({ preventScroll: true });
  }
  restoreFocusOnClose = false;
});

function closeFromHistoryAwareInteraction() {
  closeSearchHistoryEntry();
  store.close();
}

function closeFromEscape() {
  restoreFocusOnClose = true;
  closeFromHistoryAwareInteraction();
}

function closeFromOutside() {
  restoreFocusOnClose = false;
  closeFromHistoryAwareInteraction();
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeFromEscape();
  } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    event.stopPropagation();
    closeFromEscape();
  } else if (event.key === 'Tab') {
    const focusable = [...(dialog.value?.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled]), a[href]') || [])]
      .filter(element => !element.hidden);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="store.open" ref="searchLayer" class="search-dismiss-layer" @click.self="closeFromOutside">
      <section
        id="switcher"
        ref="dialog"
        class="switcher open"
        role="dialog"
        aria-modal="true"
        aria-label="搜索笔记和书签"
        @keydown="handleKeydown"
      >
        <div class="switcher-search-row">
          <input
            id="globalSearch"
            ref="input"
            :value="store.query"
            type="search"
            placeholder="搜索笔记和书签..."
            aria-label="搜索笔记和书签"
            autocomplete="off"
            @input="store.setQuery(($event.target as HTMLInputElement).value)"
          >
          <button class="switcher-close" type="button" aria-label="关闭搜索" @click="closeFromEscape">关闭</button>
        </div>
        <div id="switcherList" class="switcher-list" role="group" aria-label="搜索结果" aria-live="polite">
          <button
            v-for="note in store.snapshot.notes"
            :key="`note-${note.id}`"
            class="switcher-item"
            type="button"
            :data-search-id="note.id"
            @click.stop="navigationActions.execute({ type: 'search-result', id: note.id })"
          >
            <span class="search-kind">笔记</span>{{ note.title }}
            <small>{{ note.typeLabel }} · {{ note.updatedLabel }}</small>
          </button>
          <a
            v-for="bookmark in store.snapshot.bookmarks"
            :key="`bookmark-${bookmark.id}`"
            class="switcher-item"
            :href="bookmark.url"
            target="_blank"
            rel="noopener noreferrer"
            data-search-bookmark
            @click.stop="store.close()"
          >
            <span class="search-kind">书签</span>{{ bookmark.title }}
            <small>{{ bookmark.path || '未分组' }} · {{ bookmark.hostname }}</small>
          </a>
          <div v-if="!store.snapshot.notes.length && !store.snapshot.bookmarks.length" class="empty" style="padding:25px" role="status" aria-live="polite">
            {{ store.query.trim() ? '没有找到匹配的内容' : '还没有可搜索的内容。添加笔记或书签后，即可在这里搜索。' }}
          </div>
          <p v-if="store.snapshot.hasMoreNotes || store.snapshot.hasMoreBookmarks" class="muted" role="status" aria-live="polite">
            仅显示部分匹配结果，请输入更具体的关键词。
          </p>
        </div>
      </section>
    </div>
  </Teleport>
</template>
