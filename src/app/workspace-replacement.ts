import { createWorkspaceReplacementFlow } from '../features/vault/workspace-replacement-flow.ts';

type Dependencies = Parameters<typeof createWorkspaceReplacementFlow>[0];
type VaultData = Parameters<Dependencies['replaceVault']>[0];

/** Applies the workspace navigation policy shared by reload, conflict, and backup recovery. */
export function createWorkspaceReplacement(dependencies: Dependencies) {
  const flow = createWorkspaceReplacementFlow(dependencies);

  return {
    fromSettings: (data: VaultData) => flow.replace(data, { navigation: 'reset-home' }),
    fromSyncConflict: (data: VaultData) => flow.replace(data, { navigation: 'reset-home' }),
    fromBackup: (data: VaultData, mode: 'restore' | 'import') => flow.replace(data, {
      navigation: mode === 'import' ? 'reset-home' : 'preserve-list',
      closeBackupHistory: true
    })
  };
}
