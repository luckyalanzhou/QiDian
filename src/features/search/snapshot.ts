import type { BookmarkItem, VaultNote } from '../../../shared/api-contracts.js';

export type GlobalSearchNoteResult = {
  id: string;
  title: string;
  typeLabel: string;
  updatedLabel: string;
};

export type GlobalSearchBookmarkResult = {
  id: string;
  title: string;
  url: string;
  path: string;
  hostname: string;
};

export type GlobalSearchSnapshot = {
  notes: GlobalSearchNoteResult[];
  bookmarks: GlobalSearchBookmarkResult[];
  hasMoreNotes: boolean;
  hasMoreBookmarks: boolean;
};

export type GlobalSearchSnapshotOptions = {
  notes: readonly VaultNote[];
  bookmarks: readonly BookmarkItem[];
  query: string;
  noteIndex?: readonly GlobalSearchIndexedNote[];
  bodyText: (body: string) => string;
  hasDraftContent: (note: VaultNote) => boolean;
  typeLabel: (id: string) => string;
  formatDate: (timestamp: number) => string;
  isSafeUrl: (url: string) => boolean;
};

export type GlobalSearchIndexedNote = {
  note: VaultNote;
  searchText: string;
};

const matches = (values: readonly string[], query: string) =>
  values.join(' ').toLocaleLowerCase().includes(query);

const SEARCH_RESULT_LIMIT = 12;

export function createGlobalSearchNoteIndex(
  notes: readonly VaultNote[],
  bodyText: (body: string) => string,
  hasDraftContent: (note: VaultNote) => boolean
): GlobalSearchIndexedNote[] {
  return notes.filter(note => note.status !== 'draft' || hasDraftContent(note)).map(note => {
    const plainBody = bodyText(note.body).replace(/\s+/gu, ' ').trim();
    return {
      note,
      searchText: [note.title, note.source, ...(note.tags || []), plainBody].join(' ').toLocaleLowerCase()
    };
  });
}

export function createGlobalSearchSnapshot(options: GlobalSearchSnapshotOptions): GlobalSearchSnapshot {
  const query = options.query.trim().toLocaleLowerCase();
  const matchingNotes = query
    ? (options.noteIndex || createGlobalSearchNoteIndex(options.notes, options.bodyText, options.hasDraftContent))
      .filter(entry => entry.searchText.includes(query))
    : options.notes
      .filter(note => note.status !== 'draft' || options.hasDraftContent(note))
      .map(note => ({ note, searchText: '' }));
  const hasMoreNotes = matchingNotes.length > SEARCH_RESULT_LIMIT;
  const notes = matchingNotes
    .slice()
    .sort((left, right) => right.note.updated - left.note.updated)
    .slice(0, SEARCH_RESULT_LIMIT)
    .map(entry => ({
      id: entry.note.id,
      title: entry.note.title || '无标题笔记',
      typeLabel: options.typeLabel(entry.note.type),
      updatedLabel: options.formatDate(entry.note.updated)
    }));

  const bookmarks: GlobalSearchBookmarkResult[] = [];
  const visit = (items: readonly BookmarkItem[], path: readonly string[] = []) => {
    for (const item of items) {
      if (bookmarks.length > SEARCH_RESULT_LIMIT) return;
      if (item.kind === 'folder') {
        visit(item.children || [], [...path, item.title]);
        continue;
      }

      if (!options.isSafeUrl(item.url) || !matches([item.title, item.url, ...path], query)) continue;
      try {
        bookmarks.push({
          id: item.id,
          title: item.title,
          url: item.url,
          path: path.join(' / '),
          hostname: new URL(item.url).hostname
        });
      } catch {
        // A safe-URL policy may be broader than URL parsing; malformed values are
        // omitted from results rather than breaking the search dialog.
      }
    }
  };
  visit(options.bookmarks);

  return {
    notes,
    bookmarks: bookmarks.slice(0, SEARCH_RESULT_LIMIT),
    hasMoreNotes,
    hasMoreBookmarks: bookmarks.length > SEARCH_RESULT_LIMIT
  };
}
