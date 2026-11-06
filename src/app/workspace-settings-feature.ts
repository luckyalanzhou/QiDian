import { createWorkspaceSettingsActions } from './workspace-settings-actions.ts';
import type { useAppSettingsStore } from '../features/settings/app-settings-store.ts';

type Store = ReturnType<typeof useAppSettingsStore>;
type ActionDependencies = Parameters<typeof createWorkspaceSettingsActions>[0]['actions'];
type DerivedAction = 'localPreview' | 'confirmReload' | 'saveActiveEditor' | 'getCurrentData' | 'replaceWorkspace' | 'markIgnoredDraftHandled' | 'openImportPicker';

type WorkspaceSettingsFeatureDependencies = {
  store: Store;
  localPreview: boolean;
  actions: Omit<ActionDependencies, DerivedAction>;
  confirmAction: (message: string, options: { title: string; confirmText: string; danger: boolean }) => Promise<boolean>;
  isEditing: () => boolean;
  clearAutosave: () => void;
  saveDraft: (immediate: boolean) => unknown | Promise<unknown>;
  getCurrentData: () => ActionDependencies['getCurrentData'] extends () => infer T ? T : never;
  replaceWorkspace: ActionDependencies['replaceWorkspace'];
  markIgnoredDraftHandled: () => void;
  openImportPicker: () => void;
};

export function createWorkspaceSettingsFeature(dependencies: WorkspaceSettingsFeatureDependencies) {
  return createWorkspaceSettingsActions({
    store: dependencies.store,
    actions: {
      ...dependencies.actions,
      localPreview: dependencies.localPreview,
      confirmReload: sourceLabel => dependencies.confirmAction(dependencies.localPreview
        ? `重新载入会替换当前草稿。本地预览无法创建服务端回滚快照，请先手动导出需要保留的数据，再载入${sourceLabel}。是否继续？`
        : `重新载入会替换当前草稿。继续后会保存当前修改并创建 SQLite 回滚快照；快照与附件位于同一服务端数据库，不能防止宿主数据盘丢失。是否继续？`,
      { title: '重新载入数据', confirmText: '重新载入', danger: true }),
      saveActiveEditor: () => {
        if (!dependencies.isEditing()) return;
        dependencies.clearAutosave();
        dependencies.saveDraft(true);
      },
      getCurrentData: () => structuredClone(dependencies.getCurrentData()),
      replaceWorkspace: dependencies.replaceWorkspace,
      markIgnoredDraftHandled: dependencies.markIgnoredDraftHandled,
      openImportPicker: dependencies.openImportPicker
    }
  });
}
