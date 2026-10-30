<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { getStorageCapacity } from '../../api/system-storage';
import { useWorkspaceShellStore } from '../navigation/workspace-shell-store';
import type { StorageCapacity } from '../../api/contracts';
import { createStorageCapacityMonitor } from './storage-capacity-monitor';

const shell = useWorkspaceShellStore();
const capacity = ref<StorageCapacity | null>(null);
const capacityIsStale = ref(false);
const storageMonitor = createStorageCapacityMonitor({
  enabled: () => shell.workspaceReady && !shell.localPreview,
  visible: () => document.visibilityState === 'visible',
  read: getStorageCapacity,
  update: (value, stale) => {
    capacity.value = value;
    capacityIsStale.value = stale;
  },
  setInterval: (callback, delay) => window.setInterval(callback, delay),
  clearInterval: timer => window.clearInterval(timer)
});

const refreshCapacity = () => storageMonitor.refresh();
const stopMonitoring = () => storageMonitor.stop();
const startMonitoring = () => storageMonitor.start();

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') void refreshCapacity();
};

onMounted(() => {
  watch(() => [shell.workspaceReady, shell.localPreview] as const, startMonitoring, { immediate: true });
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  stopMonitoring();
});
</script>

<template>
  <Teleport to="#storageWarningIsland">
    <div v-if="capacity?.warning" class="storage-capacity-warning" role="status" aria-live="polite">
      <strong>数据目录所在文件系统使用率较高：</strong>
      当前已用 {{ capacity.usedPercent.toFixed(2) }}%，超过 70% 提醒阈值。建议及时清理或扩容数据盘；此提醒不会阻止保存。
      <span v-if="capacityIsStale">最近一次读取失败，当前数值为上次成功读取结果。</span>
    </div>
    <div v-else-if="capacityIsStale" role="status" aria-live="polite">
      数据目录所在文件系统的容量状态暂不可用，无法确认当前使用率。
    </div>
  </Teleport>
</template>
