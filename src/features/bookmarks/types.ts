import type { BookmarkItem } from '../../../shared/api-contracts.js';

export type BookmarkLinkView = {
  id: string;
  title: string;
  url: string;
  domain: string;
  favicon: string;
  hue: number;
  initials: string;
  pinned: boolean;
  selected: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

export type BookmarkFolderView = {
  id: string;
  title: string;
  depth: number;
  linkCount: number;
  expanded: boolean;
  selected: boolean;
  hasChildFolders: boolean;
  children: BookmarkFolderView[];
};

export type BookmarkActionItem = {
  id: string;
  title: string;
  kind: 'folder' | 'link';
  pinned: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
};

export type BookmarkSectionView = {
  id: string;
  title: string;
  count: number;
  favorites: boolean;
  links: BookmarkLinkView[];
  folderAction: BookmarkActionItem | null;
  emptyMessage?: string;
};

export type BookmarkSnapshot = {
  bookmarkCount: number;
  folderCount: number;
  organizing: boolean;
  directoryOpen: boolean;
  selectedFolder: string;
  selectedPath: string;
  query: string;
  pinnedOnly: boolean;
  folders: BookmarkFolderView[];
  subgroups: Array<{ id: string; title: string; linkCount: number }>;
  sections: BookmarkSectionView[];
  emptyMessage: string;
  selection: {
    count: number;
    visibleCount: number;
    allSelected: boolean;
    indeterminate: boolean;
    scope: string;
  };
};

export type BookmarkEditorDraft = {
  kind: 'folder' | 'link';
  id: string;
  parentId: string;
  title: string;
  url: string;
  error: string;
  saving: boolean;
};

export type BookmarkDeleteRequest =
  | { kind: 'item'; id: string; itemKind: 'folder' | 'link'; title: string; hasChildren: boolean }
  | { kind: 'all'; linkCount: number; folderCount: number };

export type BookmarkDeleteDialogState = {
  request: BookmarkDeleteRequest;
  mode: 'keep' | 'delete';
  error: string;
  saving: boolean;
};

export type BookmarkBulkDialogState = {
  mode: 'move' | 'delete';
  ids: string[];
  targetId: string;
  error: string;
  saving: boolean;
};

export type BookmarkImportDialogState = {
  items: BookmarkItem[];
  folders: Array<{ id: string; path: string }>;
  added: number;
  duplicates: number;
  skipped: number;
  error: string;
  saving: boolean;
};

export type BookmarkAction =
  | { type: 'select-folder'; id: string }
  | { type: 'toggle-folder'; id: string }
  | { type: 'toggle-directory'; open: boolean }
  | { type: 'toggle-organizing' }
  | { type: 'toggle-pinned' }
  | { type: 'search'; query: string }
  | { type: 'toggle-pin'; id: string }
  | { type: 'save-editor' }
  | { type: 'edit'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'confirm-delete' }
  | { type: 'add-link'; parentId?: string }
  | { type: 'add-folder'; parentId?: string }
  | { type: 'move'; id: string; direction: 'up' | 'down' }
  | { type: 'select-link'; id: string; selected: boolean }
  | { type: 'select-all'; selected: boolean }
  | { type: 'bulk-move' }
  | { type: 'bulk-delete' }
  | { type: 'confirm-bulk' }
  | { type: 'import' }
  | { type: 'import-file'; file: File }
  | { type: 'confirm-import' }
  | { type: 'export' }
  | { type: 'clear' };
