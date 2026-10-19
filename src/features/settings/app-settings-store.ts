import { defineStore } from 'pinia';
import { ref } from 'vue';

export type AppSettingsAction = 'retry-sync' | 'reload-cloud' | 'review-conflict' | 'restore-draft' | 'backup-history' | 'export-backup' | 'import-backup';
type SettingsIndicators = { hasConflict?: boolean; hasIgnoredDraft?: boolean };

export const useAppSettingsStore = defineStore('app-settings', () => {
  const open = ref(false);
  const hasConflict = ref(false);
  const hasIgnoredDraft = ref(false);
  let actionHandler: (action: AppSettingsAction) => void = () => undefined;

  function bindActionHandler(handler: (action: AppSettingsAction) => void) {
    actionHandler = handler;
  }

  function show() {
    open.value = true;
  }

  function close() {
    open.value = false;
  }

  function setIndicators(indicators: SettingsIndicators) {
    if (typeof indicators.hasConflict === 'boolean') hasConflict.value = indicators.hasConflict;
    if (typeof indicators.hasIgnoredDraft === 'boolean') hasIgnoredDraft.value = indicators.hasIgnoredDraft;
  }

  function dispatch(action: AppSettingsAction) {
    actionHandler(action);
  }

  return { open, hasConflict, hasIgnoredDraft, bindActionHandler, show, close, setIndicators, dispatch };
});
