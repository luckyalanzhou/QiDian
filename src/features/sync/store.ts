import { defineStore } from 'pinia';
import { ref } from 'vue';

export type SyncConflictAction = 'download-backup' | 'restore-cloud';
export type SyncConflictActionHandler = (action: SyncConflictAction) => void | Promise<void>;

export type ConflictNotePreview = {
  id: string;
  title: string;
  deleted: boolean;
  excerpt: string;
};

export type ConflictVersionPreview = {
  title: string;
  changedCount: number;
  notes: ConflictNotePreview[];
};

type SyncConflictState = {
  visible: boolean;
  summary: string;
  local: ConflictVersionPreview | null;
  remote: ConflictVersionPreview | null;
  status: string;
  statusTone: 'idle' | 'success' | 'error';
  backupReady: boolean;
  exporting: boolean;
  restoring: boolean;
};

const initialState = (): SyncConflictState => ({
  visible: false,
  summary: '',
  local: null,
  remote: null,
  status: '',
  statusTone: 'idle',
  backupReady: false,
  exporting: false,
  restoring: false
});

export const useSyncConflictStore = defineStore('sync-conflict', () => {
  const initial = initialState();
  const visible = ref(initial.visible);
  const summary = ref(initial.summary);
  const local = ref<ConflictVersionPreview | null>(initial.local);
  const remote = ref<ConflictVersionPreview | null>(initial.remote);
  const status = ref(initial.status);
  const statusTone = ref(initial.statusTone);
  const backupReady = ref(initial.backupReady);
  const exporting = ref(initial.exporting);
  const restoring = ref(initial.restoring);
  let actionHandler: SyncConflictActionHandler = () => undefined;

  function bindActions(handler: SyncConflictActionHandler) {
    actionHandler = handler;
  }

  function dispatch(action: SyncConflictAction) {
    return actionHandler(action);
  }

  function show(localVersion: ConflictVersionPreview, remoteVersion: ConflictVersionPreview) {
    visible.value = true;
    summary.value = '部分修改无法自动合并。系统已保留两个版本，请下载对照备份后再选择如何恢复。';
    local.value = localVersion;
    remote.value = remoteVersion;
    status.value = '下载对照备份后，才能载入已保存版本。';
    statusTone.value = 'idle';
    backupReady.value = false;
    exporting.value = false;
    restoring.value = false;
  }

  function close() { visible.value = false; }
  function startExport() { exporting.value = true; status.value = '正在整理两个版本及附件…'; statusTone.value = 'idle'; }
  function exportSucceeded() { exporting.value = false; backupReady.value = true; status.value = '对照备份已下载，确认后可载入 Docker 服务端版本。'; statusTone.value = 'success'; }
  function exportFailed(message: string) { exporting.value = false; status.value = message; statusTone.value = 'error'; }
  function startRestore() { restoring.value = true; }
  function restoreFailed(message: string) { restoring.value = false; status.value = message; statusTone.value = 'error'; }
  function finishRestore() { restoring.value = false; }

  return {
    visible, summary, local, remote, status, statusTone, backupReady, exporting, restoring,
    bindActions, dispatch, show, close, startExport, exportSucceeded, exportFailed,
    startRestore, restoreFailed, finishRestore
  };
});
