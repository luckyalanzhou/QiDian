import type { BookmarkItem, BookmarkFolder, BookmarkLink, VaultData } from '../../../shared/api-contracts.js';
import type { BookmarkActionItem, BookmarkFolderView, BookmarkLinkView, BookmarkSectionView, BookmarkSnapshot } from './types';

export type BookmarkViewState = {
  closed: Set<string>;
  selected: Set<string>;
  query: string;
  organizing: boolean;
  selectedFolder: string;
  pinnedOnly: boolean;
  directoryOpen: boolean;
};

type BookmarkGroup = { entries: BookmarkItem[]; links: BookmarkLink[]; path: string; folderId: string };
type LocatedItem = { item: BookmarkItem; entries: BookmarkItem[]; parent: BookmarkFolder | null };

export function locateBookmark(id: string, entries: BookmarkItem[] = [], parent: BookmarkFolder | null = null): LocatedItem | undefined {
  for (const item of entries) {
    if (item.id === id) return { item, entries, parent };
    if (item.kind === 'folder') {
      const found = locateBookmark(id, item.children, item);
      if (found) return found;
    }
  }
}

export function bookmarkFolderPaths(entries: BookmarkItem[] = [], prefix = '', excluded = '', result: Array<{ id: string; path: string }> = []) {
  for (const item of entries) if (item.kind === 'folder' && item.id !== excluded) {
    const path = prefix ? `${prefix} / ${item.title}` : item.title;
    result.push({ id: item.id, path });
    bookmarkFolderPaths(item.children, path, excluded, result);
  }
  return result;
}

export function bookmarkLinkCount(entries: BookmarkItem[] = []): number {
  return entries.reduce((count, item) => count + (item.kind === 'link' ? 1 : bookmarkLinkCount(item.children)), 0);
}

export function bookmarkCollections(entries: BookmarkItem[] = [], path = '', folderId = '', output: BookmarkGroup[] = []): BookmarkGroup[] {
  output.push({ entries, links: entries.filter((item): item is BookmarkLink => item.kind === 'link'), path: path || '未分组', folderId });
  for (const folder of entries.filter((item): item is BookmarkFolder => item.kind === 'folder')) {
    bookmarkCollections(folder.children, path ? `${path} / ${folder.title}` : folder.title, folder.id, output);
  }
  return output;
}

export function bookmarkColorHue(value: string): number {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  return [225, 165, 28, 275, 350][hash % 5];
}

function actionItem(item: BookmarkItem, entries: BookmarkItem[]): BookmarkActionItem {
  const siblings = entries.filter(sibling => sibling.kind === item.kind);
  const index = siblings.indexOf(item);
  return { id: item.id, title: item.title, kind: item.kind, pinned: item.kind === 'link' && !!item.pinned, canMoveUp: index > 0, canMoveDown: index >= 0 && index < siblings.length - 1 };
}

function linkView(item: BookmarkLink, entries: BookmarkItem[], selected: Set<string>): BookmarkLinkView {
  const siteUrl = new URL(item.url);
  const domain = siteUrl.hostname;
  const brand = domain.replace(/^(www|developers|developer|docs)\./, '');
  const initials = (item.title.match(/^[A-Za-z]{2}/)?.[0] || brand.split('.')[0].slice(0, 2)).toUpperCase();
  return {
    ...actionItem(item, entries),
    url: item.url,
    domain,
    favicon: new URL('/favicon.ico', siteUrl).href,
    hue: bookmarkColorHue(brand),
    initials,
    pinned: !!item.pinned,
    selected: selected.has(item.id),
  };
}

function folderViews(entries: BookmarkItem[], state: BookmarkViewState, folderStates: Record<string, boolean> = {}, depth = 0): BookmarkFolderView[] {
  return entries.filter((item): item is BookmarkFolder => item.kind === 'folder').map(item => ({
    id: item.id,
    title: item.title,
    depth,
    linkCount: bookmarkLinkCount(item.children),
    expanded: folderStates[item.id] ?? !state.closed.has(item.id),
    selected: state.selectedFolder === item.id,
    hasChildFolders: item.children.some(child => child.kind === 'folder'),
    children: folderViews(item.children, state, folderStates, depth + 1)
  }));
}

export function createBookmarkSnapshot(data: Pick<VaultData, 'bookmarks' | 'bookmarkFolderStates'>, state: BookmarkViewState): BookmarkSnapshot {
  const items = data.bookmarks || [];
  const paths = bookmarkFolderPaths(items);
  const selectedFolder = state.selectedFolder && locateBookmark(state.selectedFolder, items)?.item.kind === 'folder' ? state.selectedFolder : '';
  const selectedPath = paths.find(folder => folder.id === selectedFolder)?.path || '';
  const currentFolder = selectedFolder ? locateBookmark(selectedFolder, items)?.item as BookmarkFolder : null;
  const groups = selectedFolder ? bookmarkCollections(currentFolder?.children || [], selectedPath, selectedFolder) : bookmarkCollections(items);
  const query = state.query.trim().toLocaleLowerCase();
  const sections: BookmarkSectionView[] = [];

  if (query || state.pinnedOnly) {
    const results = groups.flatMap(group => group.links
      .filter(item => (!state.pinnedOnly || item.pinned) && [item.title, item.url, group.path].join(' ').toLocaleLowerCase().includes(query))
      .map(item => linkView(item, group.entries, state.selected)));
    sections.push({
      id: state.pinnedOnly ? 'favorites' : 'search',
      title: query ? '搜索结果' : '常用书签',
      count: results.length,
      favorites: !query,
      links: results,
      folderAction: null,
      emptyMessage: '没有找到书签'
    });
  } else {
    for (const group of groups) {
      const folder = group.folderId ? locateBookmark(group.folderId, items) : null;
      if (!folder && !group.links.length) continue;
      if (!group.links.length && group.entries.some(item => item.kind === 'folder') && !state.organizing) continue;
      if (!group.links.length && !state.organizing && !selectedFolder) continue;
      sections.push({
        id: group.folderId || 'root',
        title: group.path,
        count: group.links.length,
        favorites: false,
        links: group.links.map(item => linkView(item, group.entries, state.selected)),
        folderAction: folder ? actionItem(folder.item, folder.entries) : null
      });
    }
  }

  const visibleIds = new Set(sections.flatMap(section => section.links.map(item => item.id)));
  const selectedVisibleCount = [...state.selected].filter(id => visibleIds.has(id)).length;
  const visibleCount = visibleIds.size;
  return {
    bookmarkCount: bookmarkLinkCount(items),
    folderCount: paths.length,
    organizing: state.organizing,
    directoryOpen: state.directoryOpen,
    selectedFolder,
    selectedPath,
    query: state.query,
    pinnedOnly: state.pinnedOnly,
    folders: folderViews(items, { ...state, selectedFolder }, data.bookmarkFolderStates || {}),
    subgroups: (currentFolder?.children || []).filter((item): item is BookmarkFolder => item.kind === 'folder').map(item => ({ id: item.id, title: item.title, linkCount: bookmarkLinkCount(item.children) })),
    sections,
    emptyMessage: '添加网址，或在整理模式中导入浏览器书签。',
    selection: {
      count: selectedVisibleCount,
      visibleCount,
      allSelected: visibleCount > 0 && selectedVisibleCount === visibleCount,
      indeterminate: selectedVisibleCount > 0 && selectedVisibleCount < visibleCount,
      scope: query ? '搜索结果' : selectedFolder ? '当前分组（含子分组）' : state.pinnedOnly ? '常用书签' : '全部网址'
    }
  };
}
