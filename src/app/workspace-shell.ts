import { createWorkspaceShellActions, type WorkspaceShellActionDependencies } from '../features/navigation/workspace-shell-actions.ts';
import { createWorkspaceShellEvents, type WorkspaceShellEventDependencies } from '../features/navigation/workspace-shell-events.ts';
import type { useWorkspaceShellActionsStore } from '../features/navigation/workspace-shell-actions-store.ts';

type ShellStore = Pick<ReturnType<typeof useWorkspaceShellActionsStore>, 'bind'>;
type ChromeActions = Pick<WorkspaceShellActionDependencies,
  | 'closeThemeMenu' | 'applyTheme' | 'toggleThemeMenu'
  | 'closeAccountMenu' | 'toggleAccountMenu'
  | 'openProfileSettings' | 'openAppSettings' | 'signOut' | 'closeSlashMenu'
>;
type NoteTypeActions = Pick<WorkspaceShellActionDependencies,
  'toggleNoteTypes' | 'addNoteType' | 'openTypeDialog' | 'noteTypeCount' | 'toast'
>;
type NoteDeletionActions = Pick<WorkspaceShellActionDependencies,
  'confirmDeleteNote' | 'moveNoteToTrash' | 'render'
>;
type ShellEventActions = Pick<WorkspaceShellEventDependencies, 'closeSearch' | 'closeTarget'>;

export type WorkspaceShellDependencies = {
  store: ShellStore;
  chrome: ChromeActions;
  noteTypes: NoteTypeActions;
  noteDeletion: NoteDeletionActions;
  events: ShellEventActions;
};

/** Binds shell commands once and routes legacy DOM events through the same command executor. */
export function createWorkspaceShell(dependencies: WorkspaceShellDependencies) {
  const actions = createWorkspaceShellActions({
    ...dependencies.chrome,
    ...dependencies.noteTypes,
    ...dependencies.noteDeletion
  });
  const events = createWorkspaceShellEvents({
    execute: actions.execute,
    closeThemeMenu: dependencies.chrome.closeThemeMenu,
    closeAccountMenu: dependencies.chrome.closeAccountMenu,
    closeSlashMenu: dependencies.chrome.closeSlashMenu,
    ...dependencies.events
  });
  dependencies.store.bind(actions.execute);
  return { actions, events };
}
