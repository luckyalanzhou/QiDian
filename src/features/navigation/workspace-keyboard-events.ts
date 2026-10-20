export type WorkspaceKeyboardActions = {
  isEditing: () => boolean;
  toggleCommandPalette: () => void;
  saveDraft: () => void;
  updateEditorBaseline: () => void;
  closeSearch: () => void;
  closeCapture: () => void;
  closeCreateMenu: () => void;
  closeBackupHistory: () => void;
  closeAccountSettings: () => void;
  closeThemeMenu: () => void;
  closeAccountMenu: () => void;
  closeWorkspaceMenu: () => void;
  closeSlashMenu: () => void;
  openNote: (id: string) => void;
};

export function mountWorkspaceKeyboardEvents(
  document: Document,
  actions: WorkspaceKeyboardActions
): () => void {
  function handleKeydown(event: KeyboardEvent) {
    const command = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (command && key === 'k') {
      event.preventDefault();
      actions.toggleCommandPalette();
    }

    if (command && key === 's' && actions.isEditing()) {
      event.preventDefault();
      actions.saveDraft();
      actions.updateEditorBaseline();
    }

    if (event.key === 'Escape') {
      document.querySelectorAll<HTMLDetailsElement>('.item-menu[open]').forEach(menu => { menu.open = false; });
      actions.closeSearch();
      actions.closeCapture();
      actions.closeCreateMenu();
      document.querySelector('#typeOverlay')?.classList.remove('open');
      actions.closeAccountSettings();
      actions.closeBackupHistory();
      actions.closeThemeMenu();
      actions.closeAccountMenu();
      actions.closeWorkspaceMenu();
      actions.closeSlashMenu();
    }

    if (event.key === 'Enter' || event.key === ' ') {
      const target = event.target;
      const elementTarget = target && typeof (target as Element).closest === 'function'
        ? target as Element
        : null;
      const card = elementTarget?.closest<HTMLElement>('.note-card-open') ?? null;
      const id = card?.dataset.open;
      if (id) {
        event.preventDefault();
        actions.openNote(id);
      }
    }
  }

  document.addEventListener('keydown', handleKeydown);
  return () => document.removeEventListener('keydown', handleKeydown);
}
