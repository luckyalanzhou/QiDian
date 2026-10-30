<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useSyncConflictStore } from './store';
import type { ConflictVersionPreview } from './store';
import { firstRestorableFocusTarget, watchDialogFocusReturn } from '../dialogs/dialog-focus-return';

const store = useSyncConflictStore();
const versions = computed(() => [store.local, store.remote].filter((version): version is ConflictVersionPreview => version !== null));
const dialog = ref<HTMLElement | null>(null);
const closeButton = ref<HTMLButtonElement | null>(null);
const backupButton = ref<HTMLButtonElement | null>(null);
const loadCloudButton = ref<HTMLButtonElement | null>(null);
watchDialogFocusReturn(() => store.visible, () => firstRestorableFocusTarget(document.querySelectorAll<HTMLElement>('#searchTop, #mobileSearch')));

watch(() => store.visible, async visible => {
  if (!visible) return;
  await nextTick();
  closeButton.value?.focus({ preventScroll:true });
});

function close() {
  if (!store.restoring) store.close();
}

function onKeydown(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    close();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = [...(dialog.value?.querySelectorAll<HTMLElement>('button:not([disabled])') || [])];
  const first = focusable[0], last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function run(action: 'download-backup' | 'restore-cloud') {
  await store.dispatch(action);
  if (!store.visible || store.statusTone !== 'error') return;
  await nextTick();
  (action === 'download-backup' ? backupButton.value : loadCloudButton.value)?.focus({ preventScroll:true });
}
</script>

<template>
  <Teleport to="body">
    <div v-if="store.visible" id="syncConflictOverlay" class="overlay open" @mousedown.self="close">
      <section
        id="syncConflictDialog"
        ref="dialog"
        class="dialog sync-conflict-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="syncConflictTitle"
        aria-describedby="syncConflictDescription syncConflictSummary"
        tabindex="-1"
        @keydown="onKeydown"
      >
        <div class="dialog-head">
          <div>
            <h2 id="syncConflictTitle">修改需要整理</h2>
            <p id="syncConflictDescription" class="account-dialog-subtitle">两边修改了相同内容。先下载对照备份，再选择载入 Docker 服务端版本。</p>
          </div>
          <button ref="closeButton" class="round-btn" type="button" aria-label="关闭" :disabled="store.restoring" @click="close">
            <span class="ico"><svg aria-hidden="true"><use href="#i-close" /></svg></span>
          </button>
        </div>
        <div class="dialog-body">
          <div id="syncConflictSummary" class="sync-conflict-summary">{{ store.summary }}</div>
          <div id="syncConflictVersions" class="sync-conflict-versions">
            <section v-for="version in versions" :key="version.title" class="sync-conflict-version">
              <h3>{{ version.title }} · {{ version.changedCount }} 篇笔记有变化</h3>
              <template v-if="version.notes.length">
                <article v-for="note in version.notes" :key="note.id" class="sync-conflict-note">
                  <strong>{{ note.title }}<span v-if="note.deleted">（已删除）</span></strong>
                  <p>{{ note.excerpt }}</p>
                </article>
                <p v-if="version.changedCount > version.notes.length" class="sync-conflict-truncated">
                  仅显示前 {{ version.notes.length }} 项，完整内容请查看对照备份。
                </p>
              </template>
              <p v-else class="sync-conflict-empty">冲突涉及分类、书签或其他结构化信息；完整内容已放入对照备份。</p>
            </section>
          </div>
          <p id="syncConflictBackupStatus" class="account-settings-message" :class="{ success: store.statusTone === 'success', error: store.statusTone === 'error' }" role="status" aria-live="polite">{{ store.status }}</p>
        </div>
        <div class="dialog-foot">
          <button class="secondary-btn" type="button" :disabled="store.restoring" @click="close">稍后处理</button>
          <button id="downloadSyncConflict" ref="backupButton" class="secondary-btn" type="button" :disabled="store.exporting || store.restoring" @click="run('download-backup')">
            {{ store.exporting ? '正在准备备份…' : '下载两版对照备份' }}
          </button>
          <button id="loadConflictCloud" ref="loadCloudButton" class="primary-btn" type="button" :disabled="!store.backupReady || store.exporting || store.restoring" @click="run('restore-cloud')">
            {{ store.restoring ? '正在载入…' : '载入 Docker 服务端版本' }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
