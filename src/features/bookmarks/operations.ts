import type { BookmarkItem } from '../../../shared/api-contracts.js';
import { locateBookmark } from './snapshot.ts';

export function toggleBookmarkPin(items: BookmarkItem[], id: string): BookmarkItem[] | null {
  const next = structuredClone(items);
  const found = locateBookmark(id, next);
  if (found?.item.kind !== 'link') return null;
  if (found.item.pinned) delete found.item.pinned;
  else found.item.pinned = true;
  return next;
}

export function moveBookmark(items: BookmarkItem[], id: string, direction: 'up' | 'down'): BookmarkItem[] | null {
  const next = structuredClone(items);
  const found = locateBookmark(id, next);
  if (!found) return null;

  const siblings = found.entries.filter(item => item.kind === found.item.kind);
  const index = siblings.indexOf(found.item);
  const neighbor = siblings[index + (direction === 'up' ? -1 : 1)];
  if (!neighbor) return null;

  const currentIndex = found.entries.indexOf(found.item);
  const neighborIndex = found.entries.indexOf(neighbor);
  [found.entries[currentIndex], found.entries[neighborIndex]] = [found.entries[neighborIndex], found.entries[currentIndex]];
  return next;
}
