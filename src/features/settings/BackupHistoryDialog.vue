<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useBackupHistoryStore } from './backup-history-store';
import { createBackupHistoryFlow } from './backup-history-flow';
import { firstRestorableFocusTarget, watchDialogFocusReturn } from '../dialogs/dialog-focus-return';

const store = useBackupHistoryStore();
const options = store.options;
if (!options) throw new Error('备份历史尚未配置');
const flow = createBackupHistoryFlow(options);
const { state, refresh } = flow;
const dialog = ref<HTMLElement | null>(null);
const backupHistoryList = ref<HTMLElement | null>(null);
const retryButton = ref<HTMLButtonElement | null>(null);

function dateLabel(created: number) {
  const date = new Date(created);
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN');
}

function close() {
  store.close();
}

async function retry() {
  await refresh();
  await nextTick();
  if (state.error) retryButton.value?.focus();
  else if (state.items.length) backupHistoryList.value?.querySelector<HTMLButtonElement>('.backup-row-actions button')?.focus();
  else backupHistoryList.value?.querySelector<HTMLElement>('[role="status"]')?.focus();
}

watchDialogFocusReturn(
  () => store.open,
  () => firstRestorableFocusTarget(document.querySelectorAll<HTMLElement>('#accountButton, #menuBtn, #searchTop, #mobileSearch'))
);

watch(() => store.open, async open => {
  if (!open) return;
  await nextTick();
  dialog.value?.focus();
});

store.bindRefreshHandler(refresh);
onBeforeUnmount(() => store.bindRefreshHandler(null));
</script>

<template>
  <div id="backupHistoryOverlay" class="overlay" :class="{ open: store.open }" @click.self="close" @keydown.esc.stop.prevent="close">
    <section ref="dialog" class="dialog backup-dialog" role="dialog" aria-modal="true" aria-labelledby="backupHistoryTitle" tabindex="-1">
      <div class="dialog-head">
        <div>
          <h2 id="backupHistoryTitle">自动备份</h2>
          <p class="account-dialog-subtitle">{{ store.options?.localPreview ? '本地预览模式不提供服务端快照。' : '最近 20 个正文快照；可在应用内恢复。完整 ZIP 请定期下载并保存到设备外。' }}</p>
        </div>
        <button class="round-btn" type="button" aria-label="关闭" @click="close">
          <span class="ico"><svg><use href="#i-close" /></svg></span>
        </button>
      </div>
      <div class="dialog-body">
        <div id="backupHistoryList" ref="backupHistoryList" class="backup-history-list" :role="state.items.length ? 'list' : undefined" aria-live="polite">
          <div v-if="state.loading" class="empty backup-empty">{{ store.options?.localPreview ? '正在读取本地预览数据…' : '正在读取 Docker 服务端快照…' }}</div>
          <div v-else-if="state.error" class="empty backup-empty backup-history-error">
            <p role="alert">读取失败：{{ state.error }}</p>
            <button id="backupHistoryRetry" ref="retryButton" class="secondary-btn" type="button" @click="retry">重试</button>
          </div>
          <div v-else-if="state.items.length === 0" class="empty backup-empty" role="status" aria-live="polite" tabindex="-1">
            {{ flow.emptyMessage() }}
          </div>
          <article v-for="item in state.items" :key="item.revision" class="backup-row" role="listitem">
            <div class="backup-row-info">
              <strong>版本 {{ item.revision }}</strong>
              <time>{{ dateLabel(item.created) }}</time>
            </div>
            <div class="backup-row-actions">
              <button class="secondary-btn" type="button" :data-backup-download="item.revision" @click.stop="store.options?.downloadSnapshot(item.revision)">下载正文</button>
              <button class="secondary-btn" type="button" :data-backup-restore="item.revision" @click.stop="store.options?.restoreSnapshot(item.revision)">恢复此版本</button>
            </div>
          </article>
        </div>
        <p v-if="!store.options?.localPreview" class="hint backup-footnote">快照与其引用的附件保存在同一 SQLite 数据库中，可用于应用内恢复；若宿主数据盘损坏，请用设备外保存的完整 ZIP 恢复。</p>
      </div>
      <div class="dialog-foot">
        <button class="secondary-btn" type="button" @click="close">关闭</button>
      </div>
    </section>
  </div>
</template>
