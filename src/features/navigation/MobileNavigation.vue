<script setup lang="ts">
import { computed } from 'vue';
import { useNavigationActionsStore } from './navigation-actions-store';
import { useNavigationStore } from './store';
import { useGlobalSearchStore } from '../search/store';

const navigation = useNavigationStore();
const navigationActions = useNavigationActionsStore();
const search = useGlobalSearchStore();
const notesContext = computed(() => navigation.page === 'home' || navigation.page === 'note');

function icon(name: string) {
  return `#i-${name}`;
}
</script>

<template>
  <nav class="bottom-nav" aria-label="手机导航">
    <button id="mobileHome" type="button" :class="{ selected: navigation.page === 'dashboard' }" data-dashboard :aria-current="navigation.page === 'dashboard' ? 'page' : undefined" @click.stop="navigationActions.execute({ type: 'dashboard' })">
      <span class="ico"><svg aria-hidden="true"><use :href="icon('home')" /></svg></span>首页
    </button>
    <button id="mobileCats" type="button" :class="{ selected: notesContext }" data-nav="all" :aria-current="notesContext ? 'page' : undefined" @click.stop="navigationActions.execute({ type: 'home', category: 'all' })">
      <span class="ico"><svg aria-hidden="true"><use :href="icon('book')" /></svg></span>笔记
    </button>
    <button id="mobileNew" class="main-plus" type="button" aria-label="新建" title="新建" @click.stop="navigationActions.execute({ type: 'open-create-menu' })">
      <span class="ico"><svg aria-hidden="true"><use :href="icon('plus')" /></svg></span>新建
    </button>
    <button id="mobileBookmarks" type="button" :class="{ selected: navigation.page === 'bookmarks' }" :aria-current="navigation.page === 'bookmarks' ? 'page' : undefined" @click.stop="navigationActions.execute({ type: 'bookmarks' })">
      <span class="ico"><svg aria-hidden="true"><use :href="icon('link')" /></svg></span>书签
    </button>
    <button id="mobileSearch" type="button" aria-label="搜索" title="搜索" @click.stop="search.show()">
      <span class="ico"><svg aria-hidden="true"><use :href="icon('search')" /></svg></span>搜索
    </button>
  </nav>
</template>
