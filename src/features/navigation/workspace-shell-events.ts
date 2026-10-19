import type { WorkspaceShellCommand, WorkspaceShellCommandResult } from './workspace-shell-command.ts';

type ClickEvent = {
  target: EventTarget | null;
};

type WorkspaceShellDependencies = {
  closeThemeMenu: () => void;
  applyTheme: (theme: string) => void;
  toggleThemeMenu: () => void;
  closeAccountMenu: () => void;
  toggleAccountMenu: () => void;
  openProfileSettings: () => void;
  openAppSettings: () => void;
  signOut: () => void;
  closeSlashMenu: () => void;
  toggleNoteTypes: () => void;
  addNoteType: () => void;
  addCategory: () => void;
  openTypeDialog: (mode: 'edit' | 'delete', id: string) => void;
  noteTypeCount: () => number;
  toast: (message: string) => void;
  confirmDeleteNote: (id: string) => Promise<boolean>;
  moveNoteToTrash: (id: string) => Promise<boolean>;
  render: () => void;
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

export function createWorkspaceShellEvents(dependencies: WorkspaceShellDependencies) {
  function run(command: WorkspaceShellCommand): WorkspaceShellCommandResult {
    switch (command.type) {
      case 'toggle-theme-menu': dependencies.toggleThemeMenu(); return true;
      case 'apply-theme': dependencies.applyTheme(command.theme); dependencies.closeThemeMenu(); return true;
      case 'toggle-account-menu': dependencies.toggleAccountMenu(); return true;
      case 'open-profile-settings': dependencies.openProfileSettings(); return true;
      case 'open-app-settings': dependencies.openAppSettings(); return true;
      case 'sign-out': dependencies.signOut(); return true;
      case 'toggle-note-types': dependencies.toggleNoteTypes(); return true;
      case 'add-note-type': dependencies.addNoteType(); return true;
      case 'add-category': dependencies.addCategory(); return true;
      case 'edit-note-type': dependencies.openTypeDialog('edit', command.id); return true;
      case 'delete-note-type':
        if (dependencies.noteTypeCount() < 2 && command.id === 'note') {
          dependencies.toast('至少保留“普通笔记”作为默认类型');
          return true;
        }
        dependencies.openTypeDialog('delete', command.id);
        return true;
      case 'delete-note':
        return dependencies.confirmDeleteNote(command.id).then(async confirmed => {
          if (confirmed && await dependencies.moveNoteToTrash(command.id)) dependencies.render();
          return true;
        });
    }
  }

  function execute(command: WorkspaceShellCommand): WorkspaceShellCommandResult {
    dependencies.closeThemeMenu();
    dependencies.closeAccountMenu();
    dependencies.closeSlashMenu();
    return run(command);
  }

  function handle(event: ClickEvent): boolean | Promise<boolean> {
    const target = event.target;

    if (!closest(target, '#themeMenuRoot')) dependencies.closeThemeMenu();
    const themeChoice = closest(target, '[data-theme-choice]');
    if (themeChoice) {
      dependencies.applyTheme(attribute(themeChoice, 'data-theme-choice'));
      dependencies.closeThemeMenu();
      return true;
    }
    if (closest(target, '#themeBtn')) {
      dependencies.toggleThemeMenu();
      return true;
    }

    if (!closest(target, '#accountMenuRoot')) dependencies.closeAccountMenu();
    if (closest(target, '#accountButton')) {
      dependencies.closeThemeMenu();
      dependencies.toggleAccountMenu();
      return true;
    }
    if (closest(target, '#openProfileSettings')) {
      dependencies.closeAccountMenu();
      dependencies.openProfileSettings();
      return true;
    }
    if (closest(target, '#openAppSettings')) {
      dependencies.openAppSettings();
      return true;
    }
    if (closest(target, '#accountLogout')) {
      dependencies.closeAccountMenu();
      dependencies.signOut();
      return true;
    }

    if (!closest(target, '#slashMenu')) dependencies.closeSlashMenu();
    if (closest(target, '#toggleNoteTypes')) return run({ type: 'toggle-note-types' });
    const typeEdit = closest(target, '[data-type-edit]');
    if (typeEdit) return run({ type: 'edit-note-type', id: attribute(typeEdit, 'data-type-edit') });
    const typeDelete = closest(target, '[data-type-delete]');
    if (typeDelete) return run({ type: 'delete-note-type', id: attribute(typeDelete, 'data-type-delete') });

    const noteDelete = closest(target, '[data-note-delete]');
    if (noteDelete) return run({ type: 'delete-note', id: attribute(noteDelete, 'data-note-delete') });
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

  return { handle, execute };
}
