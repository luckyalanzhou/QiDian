<script setup lang="ts">
import { computed, nextTick, onBeforeMount, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useWorkspaceShellStore } from './workspace-shell-store';
import { useWorkspaceShellActionsStore } from './workspace-shell-actions-store';
import { useGlobalSearchStore } from '../search/store';
import { useCommandPaletteStore } from '../command-palette/store';
import UsageHelpDialog from '../help/UsageHelpDialog.vue';

const shell = useWorkspaceShellStore();
const shellActions = useWorkspaceShellActionsStore();
const search = useGlobalSearchStore();
const commandPalette = useCommandPaletteStore();
const usageHelpOpen = ref(false);
const themeRoot = ref<HTMLElement | null>(null);
const accountRoot = ref<HTMLElement | null>(null);
const searchShortcut = computed(() => /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? '⌘ K' : 'Ctrl K');
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

function openQuickActions() {
  shell.closeAccountMenu();
  document.querySelector<HTMLElement>('#accountButton')?.focus({ preventScroll: true });
  commandPalette.toggle();
}

function openUsageHelp() {
  shell.closeAccountMenu();
  usageHelpOpen.value = true;
}

function handleMenuKeydown(event: KeyboardEvent, menu: HTMLElement | null, close: () => void, trigger: HTMLElement | null) {
  if (!menu) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
    void nextTick(() => trigger?.focus({ preventScroll: true }));
    return;
  }
  if (event.key === 'Tab') {
    close();
    return;
  }

  const items = Array.from(menu.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])'))
    .filter(item => !item.hidden && item.getAttribute('aria-hidden') !== 'true');
  if (!items.length) return;

  const current = items.indexOf(document.activeElement as HTMLElement);
  let nextIndex: number | null = null;
  if (event.key === 'ArrowDown') nextIndex = current < 0 ? 0 : (current + 1) % items.length;
  else if (event.key === 'ArrowUp') nextIndex = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = items.length - 1;
  if (nextIndex === null) return;

  event.preventDefault();
  items[nextIndex]?.focus({ preventScroll: true });
}

function handleThemeMenuKeydown(event: KeyboardEvent) {
  handleMenuKeydown(event, themeRoot.value?.querySelector<HTMLElement>('#themeMenu') ?? null, shell.closeThemeMenu, themeRoot.value?.querySelector<HTMLElement>('#themeBtn') ?? null);
}

function handleAccountMenuKeydown(event: KeyboardEvent) {
  handleMenuKeydown(event, accountRoot.value?.querySelector<HTMLElement>('#accountMenu') ?? null, shell.closeAccountMenu, accountRoot.value?.querySelector<HTMLElement>('#accountButton') ?? null);
}

watch(() => shell.themeMenuOpen, async open => {
  if (open) {
    await nextTick();
    if (!shell.themeMenuOpen) return;
    document.querySelector<HTMLElement>('#themeMenu [aria-checked="true"]')?.focus();
    return;
  }
  if (!themeRoot.value?.contains(document.activeElement)) return;
  await nextTick();
  themeRoot.value?.querySelector<HTMLElement>('#themeBtn')?.focus({ preventScroll: true });
});

watch(() => shell.accountMenuOpen, async open => {
  if (!open) return;
  await nextTick();
  if (!shell.accountMenuOpen) return;
  accountRoot.value?.querySelector<HTMLElement>('#accountMenu [role^="menuitem"]:not([disabled])')?.focus({ preventScroll: true });
});
</script>

<template>
  <Teleport to="#topbarSearchIsland">
    <button class="search-btn" id="searchTop" type="button" aria-label="搜索你的知识" @click.stop="search.show()">
      <span class="ico"><svg aria-hidden="true"><use href="#i-search" /></svg></span>
      <span>搜索你的知识...</span>
      <span class="shortcut" aria-hidden="true">{{ searchShortcut }}</span>
    </button>
  </Teleport>
  <Teleport to="#topbarMenusIsland">
    <button
      id="openUsageHelpTop"
      class="round-btn help-trigger"
      type="button"
      title="使用帮助"
      aria-label="使用帮助"
      @click.stop="openUsageHelp"
    >
      <span class="ico"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.4 2.4 0 1 1 4.1 1.7c-1.1 1-1.8 1.4-1.8 3M12 17.2h.01" /></svg></span>
    </button>
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
      <div id="themeMenu" class="theme-popover" role="menu" aria-label="主题设置" :hidden="!shell.themeMenuOpen" @keydown="handleThemeMenuKeydown">
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
      <div id="accountMenu" class="account-popover" role="menu" :hidden="!shell.accountMenuOpen" @keydown="handleAccountMenuKeydown">
        <div class="account-menu-identity"><strong id="accountMenuUsername">{{ shell.username }}</strong></div>
        <button type="button" role="menuitem" id="openProfileSettings" @click.stop="shellActions.execute({ type: 'open-profile-settings' })"><span class="ico"><svg aria-hidden="true"><use href="#i-user" /></svg></span>个人资料</button>
        <button type="button" role="menuitem" id="openAppSettings" @click.stop="shellActions.execute({ type: 'open-app-settings' })"><span class="ico"><svg aria-hidden="true"><use href="#i-settings" /></svg></span>设置</button>
        <button type="button" role="menuitem" id="openQuickActions" @click.stop="openQuickActions"><span class="ico"><svg aria-hidden="true"><use href="#i-search" /></svg></span>快速操作</button>
        <button v-if="!shell.localPreview" type="button" role="menuitem" id="accountLogout" class="account-logout" @click.stop="shellActions.execute({ type: 'sign-out' })"><span class="ico"><svg aria-hidden="true"><use href="#i-lock" /></svg></span>退出登录</button>
      </div>
    </div>
  </Teleport>
  <UsageHelpDialog :open="usageHelpOpen" @close="usageHelpOpen = false" />
</template>
