import type { BookmarkItem, VaultNote } from '../../../shared/api-contracts.js';
import type { DashboardBookmarkFolder, DashboardBookmarkLink, DashboardBookmarkNode, DashboardSnapshot } from './store';
import type { DashboardNote } from './store';

export type DashboardSnapshotOptions = {
  notes: readonly VaultNote[];
  bookmarks: readonly BookmarkItem[];
  folderStates?: Readonly<Record<string, boolean>>;
  layout?: string;
  isDraft: (note: VaultNote) => boolean;
  publishedView: (note: VaultNote) => VaultNote;
  noteCard: (note: VaultNote) => DashboardNote;
  isSafeUrl: (value: string) => boolean;
};

function linkCount(items: readonly BookmarkItem[]): number {
  return items.reduce((total, item) => total + (item.kind === 'link' ? 1 : linkCount(item.children)), 0);
}

function rootGroups(bookmarks: readonly BookmarkItem[]): BookmarkItem[] {
  const folders = bookmarks.filter((item): item is Extract<BookmarkItem, { kind: 'folder' }> => item.kind === 'folder');
  const links = bookmarks.filter((item): item is Extract<BookmarkItem, { kind: 'link' }> => item.kind === 'link');
  return [...(links.length ? [{ id: '', kind: 'folder' as const, title: '未分组', children: links }] : []), ...folders];
}

function bookmarkNode(
  item: BookmarkItem,
  path: readonly string[],
  depth: number,
  expandRoots: boolean,
  folderStates: Readonly<Record<string, boolean>>,
  isSafeUrl: (value: string) => boolean
): DashboardBookmarkNode | null {
  if (item.kind === 'folder') {
    const nextPath = [...path, item.title];
    const children = item.children
      .map(child => bookmarkNode(child, nextPath, depth + 1, expandRoots, folderStates, isSafeUrl))
      .filter((child): child is DashboardBookmarkNode => child !== null);
    const folder: DashboardBookmarkFolder = {
      id: item.id,
      kind: 'folder',
      title: item.title,
      linkCount: linkCount(item.children),
      defaultOpen: folderStates[item.id] ?? (depth === 0 && expandRoots),
      children
    };
    return folder;
  }

  if (!isSafeUrl(item.url)) return null;
  const link: DashboardBookmarkLink = {
    id: item.id,
    kind: 'link',
    title: item.title,
    url: item.url,
    path: path.join(' / ')
  };
  return link;
}

function collectPinnedLinks(
  items: readonly BookmarkItem[],
  isSafeUrl: (value: string) => boolean,
  path: readonly string[] = []
): DashboardBookmarkLink[] {
  return items.flatMap(item => {
    if (item.kind === 'folder') return collectPinnedLinks(item.children, isSafeUrl, [...path, item.title]);
    if (!item.pinned || !isSafeUrl(item.url)) return [];
    return [{ id: item.id, kind: 'link' as const, title: item.title, url: item.url, path: path.join(' / ') }];
  });
}

export function createDashboardSnapshot(options: DashboardSnapshotOptions): DashboardSnapshot {
  const published = options.notes
    .filter(note => !options.isDraft(note))
    .slice()
    .sort((left, right) => right.updated - left.updated)
    .map(options.publishedView);
  const featured = [
    ...published.filter(note => note.pinned).slice(0, 2),
    ...published.slice(0, 4)
  ].filter((note, index, notes) => notes.findIndex(item => item.id === note.id) === index).slice(0, 6);
  const groups = rootGroups(options.bookmarks);
  const folderStates = { ...(options.folderStates || {}) };

  return {
    noteCount: published.length,
    notes: featured.map(options.noteCard),
    bookmarkCount: linkCount(options.bookmarks),
    folderCount: options.bookmarks.filter(item => item.kind === 'folder').length,
    groups: groups
      .map(item => bookmarkNode(item, [], 0, groups.length <= 4, folderStates, options.isSafeUrl))
      .filter((item): item is DashboardBookmarkNode => item !== null),
    pinnedLinks: collectPinnedLinks(options.bookmarks, options.isSafeUrl).slice(0, 8),
    layout: options.layout === 'double' ? 'double' : 'single',
    folderStates
  };
}
