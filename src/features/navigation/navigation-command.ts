export type NavigationCommand =
  | { type: 'dashboard' }
  | { type: 'bookmarks'; folderId?: string | null }
  | { type: 'add-bookmark' }
  | { type: 'trash' }
  | { type: 'note-type'; id: string }
  | { type: 'home'; category: string }
  | { type: 'open-create-menu' }
  | { type: 'open-capture' }
  | { type: 'create-from-menu'; kind: string }
  | { type: 'open-note'; id: string; forceEdit?: boolean }
  | { type: 'create-note'; kind?: string }
  | { type: 'filter-home'; typeFilter: string }
  | { type: 'search-result'; id: string }
  | { type: 'quick-image' }
  | { type: 'back' };

export type NavigationCommandResult = boolean | Promise<boolean>;
