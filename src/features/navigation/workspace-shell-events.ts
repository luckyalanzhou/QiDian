import type { WorkspaceShellCommand, WorkspaceShellCommandResult } from './workspace-shell-command.ts';

type ClickEvent = { target: EventTarget | null };

export type WorkspaceShellEventDependencies = {
  execute: (command: WorkspaceShellCommand) => WorkspaceShellCommandResult;
  closeThemeMenu: () => void;
  closeAccountMenu: () => void;
  closeSlashMenu: () => void;
  closeSearch: () => void;
  closeTarget: (id: string) => void;
};

function closest(target: EventTarget | null, selector: string): Element | null {
  if (!target || typeof (target as Element).closest !== 'function') return null;
  return (target as Element).closest(selector);
}

function attribute(element: Element, name: string): string {
  return element.getAttribute(name) || '';
}

export function createWorkspaceShellEvents(dependencies: WorkspaceShellEventDependencies) {
  function closeOutsideMenus(target: EventTarget | null) {
    if (!closest(target, '#themeMenuRoot')) dependencies.closeThemeMenu();
    if (!closest(target, '#accountMenuRoot')) dependencies.closeAccountMenu();
    if (!closest(target, '#slashMenu')) dependencies.closeSlashMenu();
  }

  function handle(event: ClickEvent): boolean | Promise<boolean> {
    const target = event.target;
    const themeChoice = closest(target, '[data-theme-choice]');
    if (themeChoice) return dependencies.execute({ type: 'apply-theme', theme: attribute(themeChoice, 'data-theme-choice') });
    if (closest(target, '#themeBtn')) return dependencies.execute({ type: 'toggle-theme-menu' });
    if (closest(target, '#accountButton')) return dependencies.execute({ type: 'toggle-account-menu' });
    if (closest(target, '#openProfileSettings')) return dependencies.execute({ type: 'open-profile-settings' });
    if (closest(target, '#openAppSettings')) return dependencies.execute({ type: 'open-app-settings' });
    if (closest(target, '#accountLogout')) return dependencies.execute({ type: 'sign-out' });
    if (closest(target, '#toggleNoteTypes')) return dependencies.execute({ type: 'toggle-note-types' });

    const typeEdit = closest(target, '[data-type-edit]');
    if (typeEdit) return dependencies.execute({ type: 'edit-note-type', id: attribute(typeEdit, 'data-type-edit') });
    const typeDelete = closest(target, '[data-type-delete]');
    if (typeDelete) return dependencies.execute({ type: 'delete-note-type', id: attribute(typeDelete, 'data-type-delete') });
    const noteDelete = closest(target, '[data-note-delete]');
    if (noteDelete) return dependencies.execute({ type: 'delete-note', id: attribute(noteDelete, 'data-note-delete') });

    closeOutsideMenus(target);
    if (closest(target, '[data-search-bookmark]')) {
      dependencies.closeSearch();
      return true;
    }
    const close = closest(target, '[data-close]');
    if (close) {
      dependencies.closeTarget(attribute(close, 'data-close'));
      return true;
    }
    return false;
  }

  return { handle };
}
