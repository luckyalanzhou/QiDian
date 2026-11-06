import { createAppSettingsActions } from '../features/settings/app-settings-actions.ts';
import type { useAppSettingsStore } from '../features/settings/app-settings-store.ts';

type AppSettingsStore = ReturnType<typeof useAppSettingsStore>;
type AppSettingsActionDependencies = Parameters<typeof createAppSettingsActions>[0];

type WorkspaceSettingsActionsDependencies = {
  store: AppSettingsStore;
  actions: AppSettingsActionDependencies;
};

export function createWorkspaceSettingsActions(dependencies: WorkspaceSettingsActionsDependencies) {
  const actions = createAppSettingsActions(dependencies.actions);
  dependencies.store.bindActionHandler(actions.dispatch);
  return { store: dependencies.store, actions };
}

type WorkspaceSettingsStatusDependencies = {
  store: Pick<AppSettingsStore, 'setIndicators'>;
  subscribe: (callback: (message?: string) => void) => void;
  hasConflict: () => boolean;
  hasIgnoredDraft: () => boolean;
  notify: (message: string) => void;
};

export function mountWorkspaceSettingsStatus(dependencies: WorkspaceSettingsStatusDependencies) {
  function refresh(message?: string) {
    dependencies.store.setIndicators({
      hasConflict: dependencies.hasConflict(),
      hasIgnoredDraft: dependencies.hasIgnoredDraft()
    });
    if (message && /(失败|尚未写入|未完成|冲突|失效|超时|不可用|未能|超[出过])/.test(message)) {
      dependencies.notify(message);
    }
  }

  dependencies.subscribe(refresh);
  refresh();
  return { refresh };
}
