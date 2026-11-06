import type { VaultData } from '../../shared/api-contracts.js';
import { createRecycleBinView } from '../compat/recycle-bin-view.js';
import { createTrashWorkflows } from '../features/trash/workflows.ts';
import type { useTrashStore } from '../features/trash/store.ts';

type TrashStore = Pick<ReturnType<typeof useTrashStore>, 'bindActions'>;
type MutationPort = Parameters<typeof createTrashWorkflows>[0]['mutateVault'];

export type WorkspaceTrashDependencies = {
  usesVueWorkspace: boolean;
  store: TrashStore;
  main: HTMLElement;
  getVault: () => VaultData;
  mutateVault: MutationPort;
  mutateLegacyData: (operation: (vault: VaultData) => unknown) => unknown;
  saveLegacyData: () => unknown;
  confirmClear: (count: number) => Promise<boolean>;
  notify: (message: string) => void;
  shouldRefreshLegacyView: () => boolean;
  isLegacyTrashPage: () => boolean;
};

/** Owns the Vue trash workflow and its legacy recycle-bin adapter. */
export function createWorkspaceTrashFeature(dependencies: WorkspaceTrashDependencies) {
  const workflows = dependencies.usesVueWorkspace ? createTrashWorkflows({
    getVault: dependencies.getVault,
    mutateVault: dependencies.mutateVault,
    confirmClear: dependencies.confirmClear,
    notify: dependencies.notify
  }) : null;

  let legacyView: ReturnType<typeof createRecycleBinView> | null = null;
  if (!dependencies.usesVueWorkspace) {
    legacyView = createRecycleBinView({
      main: dependencies.main,
      getData: dependencies.getVault,
      mutateData: dependencies.mutateLegacyData,
      save: dependencies.saveLegacyData,
      notify: dependencies.notify,
      onChange: () => {
        if (dependencies.shouldRefreshLegacyView()) legacyView?.render();
      }
    });
  }

  const actions = workflows || {
    restore: (id: string) => legacyView?.restore(id) || Promise.resolve(false),
    clearAll: async () => false,
    pruneExpired: () => legacyView?.pruneExpired() || 0
  };

  return {
    workflows,
    legacyView,
    pruneExpired: () => workflows ? workflows.pruneExpired() : legacyView?.pruneExpired() || 0,
    cleanExpired: () => {
      const count = workflows ? workflows.pruneExpired() : legacyView?.pruneExpired() || 0;
      if (count && dependencies.isLegacyTrashPage()) legacyView?.render();
      return count;
    },
    bindActions: () => dependencies.store.bindActions(actions)
  };
}
