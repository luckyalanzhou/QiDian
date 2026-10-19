<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useBackupHistoryStore } from './backup-history-store';
import { createBackupHistoryFlow } from './backup-history-flow';

const store = useBackupHistoryStore();
const options = store.options;
if (!options) throw new Error('备份历史尚未配置');
const flow = createBackupHistoryFlow(options);
const { state, refresh } = flow;
const dialog = ref<HTMLElement | null>(null);
let returnFocus: HTMLElement | null = null;

function dateLabel(created: number) {
  const date = new Date(created);
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN');
}

function close() {
  store.close();
}

watch(() => store.open, async open => {
  if (open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    dialog.value?.focus();
    return;
  }
  void nextTick(() => returnFocus?.isConnected && returnFocus.focus({ preventScroll: true }));
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
          <p class="account-dialog-subtitle">{{ store.options?.localPreview ? '本地预览模式不提供服务端快照。' : '最近 20 个正文快照；恢复前会先下载当前完整备份。' }}</p>
        </div>
        <button class="round-btn" type="button" aria-label="关闭" @click="close">
          <span class="ico"><svg><use href="#i-close" /></svg></span>
        </button>
      </div>
      <div class="dialog-body">
        <div id="backupHistoryList" class="backup-history-list" role="list" aria-live="polite">
          <div v-if="state.loading" class="empty backup-empty">{{ store.options?.localPreview ? '正在读取本地预览数据…' : '正在读取 Docker 服务端快照…' }}</div>
          <div v-else-if="state.error" class="empty backup-empty" role="alert">读取失败：{{ state.error }}</div>
          <div v-else-if="state.items.length === 0" class="empty backup-empty">
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
        <p v-if="!store.options?.localPreview" class="hint backup-footnote">历史快照只包含笔记正文和元数据，不含附件文件。要保留附件，请定期下载完整备份。</p>
      </div>
      <div class="dialog-foot">
        <button class="secondary-btn" type="button" @click="close">关闭</button>
      </div>
    </section>
  </div>
</template>
