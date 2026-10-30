import type { VaultData } from '../../../shared/api-contracts.js';

type DashboardActionDependencies = {
  getVault: () => VaultData;
  mutateVault: <T>(operation: (vault: VaultData) => T) => T;
  persist: () => unknown;
};

export function createDashboardActions(dependencies: DashboardActionDependencies) {
  function saveFolder(id: string, open: boolean) {
    const current = dependencies.getVault().dashboardBookmarkFolders || {};
    if (current[id] === open) return;
    dependencies.mutateVault(vault => {
      vault.dashboardBookmarkFolders = { ...(vault.dashboardBookmarkFolders || {}), [id]: open };
    });
    dependencies.persist();
  }

  function setLayout(layout: 'single' | 'double') {
    const next = layout === 'double' ? 'double' : 'single';
    if ((dependencies.getVault().dashboardBookmarkLayout || 'single') === next) return;
    dependencies.mutateVault(vault => {
      vault.dashboardBookmarkLayout = next;
    });
    dependencies.persist();
  }

  function setAllFolders(ids: string[], open: boolean) {
    const current = dependencies.getVault().dashboardBookmarkFolders || {};
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.every(id => current[id] === open)) return;
    dependencies.mutateVault(vault => {
      vault.dashboardBookmarkFolders = {
        ...(vault.dashboardBookmarkFolders || {}),
        ...Object.fromEntries(uniqueIds.map(id => [id, open]))
      };
    });
    dependencies.persist();
  }

  return { saveFolder, setLayout, setAllFolders };
}
