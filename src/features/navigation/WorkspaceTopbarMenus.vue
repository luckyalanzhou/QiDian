<script setup lang="ts">
import { computed, nextTick, onBeforeMount, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useWorkspaceShellStore } from './workspace-shell-store';
import { useWorkspaceShellActionsStore } from './workspace-shell-actions-store';
import { useGlobalSearchStore } from '../search/store';

const shell = useWorkspaceShellStore();
const shellActions = useWorkspaceShellActionsStore();
const search = useGlobalSearchStore();
const themeRoot = ref<HTMLElement | null>(null);
const accountRoot = ref<HTMLElement | null>(null);
const icon = computed(() => shell.resolvedDark ? '#i-sun' : '#i-moon');
const themeLabel = computed(() => {
  const label = shell.themePreference === 'system'
    ? `主题：跟随系统（当前${shell.resolvedDark ? '深色' : '浅色'}）`
    : `主题：${shell.themePreference === 'dark' ? '深色' : '浅色'}`;
  return label;
});

onBeforeMount(() => document.querySelector('#topbarSearchIsland [data-legacy-fallback]')?.remove());

function closeMenusOnOutside(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Node) || themeRoot.value?.contains(target) || accountRoot.value?.contains(target)) return;
  shell.closeThemeMenu();
  shell.closeAccountMenu();
}

onMounted(() => document.addEventListener('click', closeMenusOnOutside, true));
onBeforeUnmount(() => document.removeEventListener('click', closeMenusOnOutside, true));

watch(() => shell.themeMenuOpen, async open => {
  if (!open) return;
  await nextTick();
  document.querySelector<HTMLElement>('#themeMenu [aria-checked="true"]')?.focus();
});
</script>

<template>
  <Teleport to="#topbarSearchIsland">
    <button class="search-btn" id="searchTop" type="button" @click.stop="search.show()">
      <span class="ico"><svg aria-hidden="true"><use href="#i-search" /></svg></span>
      <span>搜索你的知识...</span>
      <span class="shortcut">⌘ K</span>
    </button>
  </Teleport>
  <Teleport to="#topbarMenusIsland">
    <div id="themeMenuRoot" ref="themeRoot" class="theme-menu">
      <button
        id="themeBtn"
        class="round-btn theme-toggle"
        type="button"
        :title="themeLabel"
        :aria-label="`${themeLabel}，打开主题设置`"
        aria-haspopup="menu"
        :aria-expanded="shell.themeMenuOpen"
        aria-controls="themeMenu"
        @click.stop="shellActions.execute({ type: 'toggle-theme-menu' })"
      >
        <span class="ico"><svg aria-hidden="true"><use :href="icon" /></svg></span>
      </button>
      <div id="themeMenu" class="theme-popover" role="menu" aria-label="主题设置" :hidden="!shell.themeMenuOpen">
        <button
          v-for="choice in [{ id: 'system', label: '跟随系统' }, { id: 'light', label: '浅色' }, { id: 'dark', label: '深色' }]"
          :key="choice.id"
          type="button"
          role="menuitemradio"
          :data-theme-choice="choice.id"
          :class="{ selected: shell.themePreference === choice.id }"
          :aria-checked="shell.themePreference === choice.id"
          @click.stop="shellActions.execute({ type: 'apply-theme', theme: choice.id })"
        >
          <span>{{ choice.label }}</span><span class="theme-choice-check" aria-hidden="true">✓</span>
        </button>
      </div>
    </div>
    <div id="accountMenuRoot" ref="accountRoot" class="account-menu">
      <button
        id="accountButton"
        class="avatar account-trigger"
        type="button"
        :title="`账号：${shell.username}`"
        :aria-label="`打开账号菜单：${shell.username}`"
        aria-haspopup="menu"
        :aria-expanded="shell.accountMenuOpen"
        aria-controls="accountMenu"
        @click.stop="shellActions.execute({ type: 'toggle-account-menu' })"
      >
        <svg v-if="!shell.avatarUrl" class="account-user-icon" aria-hidden="true"><use href="#i-user" /></svg>
        <img v-else :src="shell.avatarUrl" alt="">
      </button>
      <div id="accountMenu" class="account-popover" role="menu" :hidden="!shell.accountMenuOpen">
        <div class="account-menu-identity"><strong id="accountMenuUsername">{{ shell.username }}</strong></div>
        <button type="button" role="menuitem" id="openProfileSettings" @click.stop="shellActions.execute({ type: 'open-profile-settings' })"><span class="ico"><svg aria-hidden="true"><use href="#i-user" /></svg></span>个人资料</button>
        <button type="button" role="menuitem" id="openAppSettings" @click.stop="shellActions.execute({ type: 'open-app-settings' })"><span class="ico"><svg aria-hidden="true"><use href="#i-settings" /></svg></span>设置</button>
        <button v-if="!shell.localPreview" type="button" role="menuitem" id="accountLogout" class="account-logout" @click.stop="shellActions.execute({ type: 'sign-out' })"><span class="ico"><svg aria-hidden="true"><use href="#i-lock" /></svg></span>退出登录</button>
      </div>
    </div>
  </Teleport>
</template>
