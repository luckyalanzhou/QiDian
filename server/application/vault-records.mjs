const PREFERENCE_KEYS = [
  'theme', 'pasteMode', 'noteTypesExpanded', 'dashboardBookmarkLayout',
  'dashboardBookmarkFolders', 'bookmarkDirectoryOpen', 'bookmarkFolderStates'
];

function noteRecord(note) {
  const { tags = [], ...data } = note;
  const tagRows = tags.map((tag, position) => ({ noteId: note.id, scope: 'current', tag, position }));
  if (data.publishedSnapshot) {
    const { tags: publishedTags = [], ...publishedSnapshot } = data.publishedSnapshot;
    data.publishedSnapshot = publishedSnapshot;
    tagRows.push(...publishedTags.map((tag, position) => ({ noteId: note.id, scope: 'published', tag, position })));
  }
  return { id: note.id, data, tagRows };
}

function flattenBookmarks(items, parentId = null, rows = []) {
  items.forEach((item, position) => {
    const { children, ...data } = item;
    rows.push({ id: item.id, parentId, position, kind: item.kind, data });
    if (item.kind === 'folder') flattenBookmarks(children, item.id, rows);
  });
  return rows;
}

function parseData(value) {
  return typeof value === 'string' ? JSON.parse(value) : structuredClone(value);
}

function byPosition(left, right) {
  return left.position - right.position || String(left.id || '').localeCompare(String(right.id || ''));
}

/** Split the stable Vault snapshot into independently stored account records. */
export function vaultToRecords(vault) {
  const notes = vault.notes.map((note, position) => ({ ...noteRecord(note), position }));
  const tags = notes.flatMap(note => note.tagRows);
  return {
    notes: notes.map(({ tagRows: _tagRows, ...note }) => note),
    tags,
    bookmarks: flattenBookmarks(vault.bookmarks || []),
    categories: vault.categories.map((value, position) => ({ value, position })),
    noteTypes: (vault.noteTypes || []).map((item, position) => ({ ...item, position })),
    trash: (vault.trash || []).map((entry, position) => ({ id: entry.id, position, data: entry })),
    preferences: Object.fromEntries(PREFERENCE_KEYS
      .filter(key => vault[key] !== undefined)
      .map(key => [key, vault[key]]))
  };
}

/** Rebuild the compatible aggregate shape used by backups and older clients. */
export function vaultFromRecords(input) {
  const records = {
    notes: input.notes || [], tags: input.tags || [], bookmarks: input.bookmarks || [],
    categories: input.categories || [], noteTypes: input.noteTypes || [], trash: input.trash || [],
    preferences: input.preferences || {}
  };
  const tagGroups = new Map();
  for (const row of records.tags) {
    const key = `${row.noteId}\0${row.scope}`;
    if (!tagGroups.has(key)) tagGroups.set(key, []);
    tagGroups.get(key).push(row);
  }
  const notes = records.notes.slice().sort(byPosition).map(row => {
    const note = parseData(row.data);
    note.tags = (tagGroups.get(`${row.id}\0current`) || []).slice().sort(byPosition).map(item => item.tag);
    if (note.publishedSnapshot) {
      note.publishedSnapshot.tags = (tagGroups.get(`${row.id}\0published`) || []).slice().sort(byPosition).map(item => item.tag);
    }
    return note;
  });

  const bookmarkRows = records.bookmarks.slice().sort((left, right) =>
    String(left.parentId || '').localeCompare(String(right.parentId || '')) || byPosition(left, right));
  const bookmarkMap = new Map(bookmarkRows.map(row => {
    const item = parseData(row.data);
    if (item.kind === 'folder') item.children = [];
    return [row.id, { row, item }];
  }));
  const bookmarks = [];
  for (const { row, item } of bookmarkMap.values()) {
    if (row.parentId === null || row.parentId === undefined || row.parentId === '') bookmarks.push(item);
    else {
      const parent = bookmarkMap.get(row.parentId);
      if (!parent || parent.item.kind !== 'folder') throw new Error(`书签分组引用无效：${row.parentId}`);
      parent.item.children.push(item);
    }
  }
  const sortTree = items => {
    items.sort((left, right) => byPosition(bookmarkMap.get(left.id).row, bookmarkMap.get(right.id).row));
    for (const item of items) if (item.kind === 'folder') sortTree(item.children);
  };
  sortTree(bookmarks);

  const preferences = records.preferences;
  return {
    categories: records.categories.slice().sort(byPosition).map(row => row.value),
    ...(records.noteTypes.length ? { noteTypes: records.noteTypes.slice().sort(byPosition).map(({ id, name }) => ({ id, name })) } : {}),
    notes, bookmarks,
    trash: records.trash.slice().sort(byPosition).map(row => parseData(row.data)),
    ...Object.fromEntries(PREFERENCE_KEYS.filter(key => preferences[key] !== undefined).map(key => [key, preferences[key]]))
  };
}
