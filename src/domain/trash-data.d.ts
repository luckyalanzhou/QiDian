import type { BookmarkItem, TrashEntry, VaultData, VaultNote } from '../../shared/api-contracts.js';

export const TRASH_RETENTION_MS: number;
export function createTrashEntry(
  kind: 'note', item: VaultNote, location?: TrashEntryLocation, extra?: Record<string, unknown>, deletedAt?: number
): TrashEntry;
export function createTrashEntry(
  kind: 'bookmark', item: BookmarkItem, location?: TrashEntryLocation, extra?: Record<string, unknown>, deletedAt?: number
): TrashEntry;
export function pruneExpiredTrash(data: VaultData, now?: number): number;
export function restoreTrashEntry(data: VaultData, trashId: string): TrashEntry;

type TrashEntryLocation = {
  parentId?: string;
  index?: number;
  previousId?: string;
  nextId?: string;
};
