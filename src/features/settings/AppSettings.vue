<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { useAppSettingsStore, type AppSettingsAction } from './app-settings-store';
import { useWorkspaceShellStore } from '../navigation/workspace-shell-store';

const state = useAppSettingsStore();
const shell = useWorkspaceShellStore();
const dialog = ref<HTMLElement | null>(null);
let returnFocus: HTMLElement | null = null;

watch(() => state.open, async open => {
  if (open) {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    await nextTick();
    dialog.value?.focus();
    return;
  }
  void nextTick(() => returnFocus?.isConnected && returnFocus.focus({ preventScroll: true }));
});
</script>

<template>
  <div id="appSettingsOverlay" class="overlay" :class="{ open: state.open }" @click.self="state.close" @keydown.esc.stop.prevent="state.close">
    <section ref="dialog" class="dialog account-dialog" role="dialog" aria-modal="true" aria-labelledby="appSettingsTitle" tabindex="-1">
      <div class="dialog-head">
        <div>
          <h2 id="appSettingsTitle">设置</h2>
          <p class="account-dialog-subtitle">管理数据恢复和备份迁移。</p>
        </div>
        <button class="round-btn" data-close="appSettingsOverlay" aria-label="关闭" @click="state.close">
          <span class="ico"><svg><use href="#i-close" /></svg></span>
        </button>
      </div>
      <div class="dialog-body account-settings-body">
        <section class="settings-group">
          <h3>数据与恢复</h3>
          <p class="hint settings-group-hint">{{ shell.localPreview ? '数据仅保存在此浏览器的本地预览库。' : '笔记保存在 Docker 挂载的数据目录。' }}</p>
          <div class="settings-actions">
            <button class="settings-action" id="retrySync" type="button" @click="state.dispatch('retry-sync')">
              <span class="ico"><svg><use href="#i-upload" /></svg></span>
              <span><strong>重试保存</strong><small>继续写入当前页面保留的修改</small></span>
            </button>
            <button class="settings-action" id="reloadCloud" type="button" @click="state.dispatch('reload-cloud')">
              <span class="ico"><svg><use href="#i-note" /></svg></span>
              <span><strong>重新载入数据</strong><small>{{ shell.localPreview ? '用此浏览器保存的数据替换当前页面内容' : '用 Docker 数据目录中的版本替换当前页面内容' }}</small></span>
            </button>
            <button class="settings-action" id="reviewSyncConflict" type="button" :hidden="!state.hasConflict" @click="state.dispatch('review-conflict')">
              <span class="ico"><svg><use href="#i-note" /></svg></span>
              <span><strong>整理未合并修改</strong><small>对照保留的版本并选择如何恢复</small></span>
            </button>
            <button class="settings-action" id="restoreLocalDraft" type="button" :hidden="!state.hasIgnoredDraft" @click="state.dispatch('restore-draft')">
              <span class="ico"><svg><use href="#i-back" /></svg></span>
              <span><strong>恢复旧版暂存内容</strong><small>将浏览器保留的旧内容恢复到知识库</small></span>
            </button>
          </div>
        </section>
        <section class="settings-group">
          <h3>备份与迁移</h3>
          <p class="hint settings-group-hint">{{ shell.localPreview ? '本地预览支持导出或导入完整知识库备份。' : '下载历史快照，或导出、导入完整知识库备份。' }}</p>
          <div class="settings-actions">
            <button class="settings-action" id="backupHistory" type="button" @click="state.dispatch('backup-history')">
              <span class="ico"><svg><use href="#i-note" /></svg></span>
              <span><strong>自动备份</strong><small>{{ shell.localPreview ? '本地预览暂不提供历史快照' : '查看并下载自动保存的历史快照' }}</small></span>
            </button>
            <button class="settings-action" id="exportBtn" type="button" @click="state.dispatch('export-backup')">
              <span class="ico"><svg><use href="#i-download" /></svg></span>
              <span><strong>导出完整备份</strong><small>下载包含笔记、附件和元数据的备份</small></span>
            </button>
            <button class="settings-action" id="importBtn" type="button" @click="state.dispatch('import-backup')">
              <span class="ico"><svg><use href="#i-upload" /></svg></span>
              <span><strong>导入备份</strong><small>从备份文件恢复知识库</small></span>
            </button>
          </div>
        </section>
      </div>
      <div class="dialog-foot account-dialog-foot"><span class="hint">{{ shell.localPreview ? '设置仅影响当前浏览器预览' : '设置只影响当前账号' }}</span></div>
    </section>
  </div>
</template>
