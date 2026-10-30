<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useCommandPaletteStore } from './store';
import { useGlobalSearchStore } from '../search/store';
import { firstRestorableFocusTarget } from '../dialogs/dialog-focus-return';

type Command = {
  id: string;
  title: string;
  group: string;
  keywords: string;
  selector?: string;
  search?: boolean;
};

const store = useCommandPaletteStore();
const globalSearch = useGlobalSearchStore();
const input = ref<HTMLInputElement | null>(null);
const returnFocus = ref<HTMLElement | null>(null);
let restoreFocusOnClose = true;

const commands: Command[] = [
  { id: 'dashboard', title: '打开首页', group: '导航', keywords: '首页 空间 主页 dashboard', selector: '#mobileHome' },
  { id: 'notes', title: '打开笔记', group: '导航', keywords: '笔记 notes', selector: '#mobileCats' },
  { id: 'bookmarks', title: '打开书签', group: '导航', keywords: '书签 收藏 bookmarks', selector: '#mobileBookmarks' },
  { id: 'create', title: '新建内容', group: '创建', keywords: '新建 笔记 书签 记录 create', selector: '#mobileNew' },
  { id: 'search', title: '搜索笔记和书签', group: '搜索', keywords: '搜索 查找 笔记 书签 search', search: true }
];

const filteredCommands = computed(() => {
  const query = store.query.trim().toLocaleLowerCase();
  if (!query) return commands;
  return commands.filter(command => `${command.title} ${command.group} ${command.keywords}`.toLocaleLowerCase().includes(query));
});

watch(() => store.open, async open => {
  if (!open) {
    await nextTick();
    if (restoreFocusOnClose) {
      const fallbackTargets = document.querySelectorAll<HTMLElement>('#searchTop, #mobileSearch, #menuBtn, #accountButton');
      firstRestorableFocusTarget([
        ...(returnFocus.value ? [returnFocus.value] : []),
        ...fallbackTargets
      ])?.focus({ preventScroll: true });
    }
    restoreFocusOnClose = true;
    return;
  }
  returnFocus.value = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  await nextTick();
  input.value?.focus();
});

watch(filteredCommands, commandsNow => {
  if (store.activeIndex >= commandsNow.length) store.setActiveIndex(0, commandsNow.length);
});

function close() {
  store.close();
}

function openSearch(query: string) {
  globalSearch.show(query, returnFocus.value);
}

function run(command: Command) {
  const query = store.query.trim();
  restoreFocusOnClose = false;
  close();
  if (command.search) {
    openSearch(query);
    return;
  }
  if (command.selector) document.querySelector<HTMLButtonElement>(command.selector)?.click();
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    event.stopPropagation();
    const focusReturnTarget = returnFocus.value;
    restoreFocusOnClose = false;
    close();
    globalSearch.show('', focusReturnTarget);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    close();
  } else if (event.key === 'Tab') {
    const focusable = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled])')];
    const first = focusable[0], last = focusable.at(-1);
    if (first && last && event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (first && last && !event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    store.setActiveIndex(store.activeIndex + 1, filteredCommands.value.length);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    store.setActiveIndex(store.activeIndex - 1, filteredCommands.value.length);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    const command = filteredCommands.value[store.activeIndex];
    if (command) run(command);
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="store.open" class="command-palette-backdrop" @mousedown.self="close">
      <section
        class="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="快速操作"
        @click.stop
        @keydown.stop="onKeydown"
      >
        <header class="command-palette-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
          <input
            id="commandPaletteInput"
            ref="input"
            :value="store.query"
            type="search"
            autocomplete="off"
            placeholder="搜索页面或操作…"
            aria-label="快速操作"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="commandPaletteList"
            :aria-expanded="store.open"
            :aria-activedescendant="filteredCommands[store.activeIndex] ? `command-${filteredCommands[store.activeIndex].id}` : undefined"
            @input="store.setQuery(($event.target as HTMLInputElement).value)"
          >
          <kbd>ESC</kbd>
        </header>
        <div id="commandPaletteList" class="command-palette-list" role="listbox" aria-label="可用操作">
          <button
            v-for="(command, index) in filteredCommands"
            :id="`command-${command.id}`"
            :key="command.id"
            class="command-palette-item"
            :class="{ active: index === store.activeIndex }"
            type="button"
            role="option"
            :aria-selected="index === store.activeIndex"
            @mouseenter="store.setActiveIndex(index, filteredCommands.length)"
            @click="run(command)"
          >
            <span class="command-palette-item-icon" aria-hidden="true">
              <svg v-if="command.id === 'search'" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>
              <svg v-else-if="command.id === 'create'" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
              <svg v-else-if="command.id === 'bookmarks'" viewBox="0 0 24 24"><path d="M6 4h12v17l-6-4-6 4z"/></svg>
              <svg v-else-if="command.id === 'notes'" viewBox="0 0 24 24"><path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/></svg>
              <svg v-else viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/></svg>
            </span>
            <span class="command-palette-item-copy">
              <span>{{ command.title }}</span>
              <small>{{ command.group }}</small>
            </span>
            <span v-if="index === store.activeIndex" class="command-palette-enter" aria-hidden="true">↵</span>
          </button>
          <p v-if="!filteredCommands.length" class="command-palette-empty" role="status" aria-live="polite">没有匹配的操作</p>
        </div>
        <footer class="command-palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> 移动</span>
          <span><kbd>↵</kbd> 打开</span>
        </footer>
      </section>
    </div>
  </Teleport>
</template>
