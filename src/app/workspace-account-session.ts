import { connectSessionRecoveryFlow } from '../features/auth/session-recovery-flow.ts';
import { createSignOutFlow } from '../features/account/sign-out-flow.ts';
import type { VaultData, VaultNote } from '../../shared/api-contracts.js';

type SessionRecoveryDependencies = Parameters<typeof connectSessionRecoveryFlow>[0];
type RecoveryResult = Parameters<SessionRecoveryDependencies['applyAuthenticated']>[0];
type RecoveryDependencies = Omit<SessionRecoveryDependencies, 'applyAuthenticated'>;
type SignOutDependencies = Parameters<typeof createSignOutFlow>[0];

export type WorkspaceAccountSessionDependencies = {
  recovery: RecoveryDependencies;
  authenticatedWorkspace: {
    replaceVault: (vault: VaultData) => void;
    syncBookmarkPreferences: () => void;
    isEditing: () => boolean;
    getEditingNoteId: () => string | null;
    findNote: (id: string) => VaultNote | undefined;
    setEditingDraft: (note: VaultNote) => void;
    destroyEditor: () => void;
    render: () => void;
  };
  signOut: SignOutDependencies;
};

/** Joins authentication recovery and safe sign-out to one mounted workspace session. */
export function createWorkspaceAccountSession(dependencies: WorkspaceAccountSessionDependencies) {
  connectSessionRecoveryFlow({
    ...dependencies.recovery,
    applyAuthenticated: (result: RecoveryResult) => {
      dependencies.authenticatedWorkspace.replaceVault(structuredClone(result.data));
      dependencies.authenticatedWorkspace.syncBookmarkPreferences();
      const noteId = dependencies.authenticatedWorkspace.getEditingNoteId();
      if (dependencies.authenticatedWorkspace.isEditing() && noteId) {
        const current = dependencies.authenticatedWorkspace.findNote(noteId);
        if (current) dependencies.authenticatedWorkspace.setEditingDraft(structuredClone(current));
      }
      dependencies.authenticatedWorkspace.destroyEditor();
      dependencies.authenticatedWorkspace.render();
    }
  });
  const signOutFlow = createSignOutFlow(dependencies.signOut);

  return { signOut: () => signOutFlow.run() };
}
