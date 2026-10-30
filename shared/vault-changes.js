const PREFERENCE_KEYS = [
  'theme', 'pasteMode', 'noteTypesExpanded', 'dashboardBookmarkLayout',
  'dashboardBookmarkFolders', 'bookmarkDirectoryOpen', 'bookmarkFolderStates'
];

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function flattenBookmarks(items, parentId = null, rows = []) {
  items.forEach((item, position) => {
    const { children, ...data } = item;
    rows.push({ id: item.id, parentId, position, kind: item.kind, data });
    if (item.kind === 'folder') flattenBookmarks(children, item.id, rows);
  });
  return rows;
}

function orderRows(left, right) {
  return left.position - right.position || String(left.id).localeCompare(String(right.id));
}

function bookmarksFromRows(rows) {
  const items = new Map(rows.map(row => {
    const item = structuredClone(row.data);
    if (item.kind === 'folder') item.children = [];
    return [row.id, { row, item }];
  }));
  const roots = [];
  for (const { row, item } of items.values()) {
    if (row.parentId === null || row.parentId === undefined || row.parentId === '') roots.push(item);
    else {
      const parent = items.get(row.parentId);
      if (!parent || parent.item.kind !== 'folder') throw new Error(`书签分组引用无效：${row.parentId}`);
      parent.item.children.push(item);
    }
  }
  const sortTree = current => {
    current.sort((left, right) => orderRows(items.get(left.id).row, items.get(right.id).row));
    for (const item of current) if (item.kind === 'folder') sortTree(item.children);
  };
  sortTree(roots);
  return roots;
}

function mapChanges(before, after, position) {
  const oldMap = new Map(before.map((item, index) => [item.id, { item, position: index }]));
  const newMap = new Map(after.map((item, index) => [item.id, { item, position: index }]));
  return {
    upsert: after.flatMap((item, index) => {
      const previous = oldMap.get(item.id);
      return !previous || previous.position !== index || !same(previous.item, item)
        ? [{ id: item.id, position: position ? position(item, index) : index, data: item }] : [];
    }),
    delete: before.filter(item => !newMap.has(item.id)).map(item => item.id)
  };
}

/** Return a stable, per-record change set from one complete vault to another. */
export function diffVaultChanges(before, after) {
  const oldBookmarks = flattenBookmarks(before.bookmarks || []);
  const newBookmarks = flattenBookmarks(after.bookmarks || []);
  const bookmarkChanges = mapChanges(oldBookmarks, newBookmarks, (row, index) => row.position);
  bookmarkChanges.upsert = bookmarkChanges.upsert.map(({ data, ...record }) => ({ ...record, parentId: data.parentId, kind: data.kind, data: data.data }));

  const oldTrash = before.trash || [], newTrash = after.trash || [];
  const trashChanges = mapChanges(oldTrash, newTrash);
  const preferences = { set: {}, delete: [] };
  for (const key of PREFERENCE_KEYS) {
    if (after[key] === undefined) {
      if (before[key] !== undefined) preferences.delete.push(key);
    } else if (before[key] === undefined || !same(before[key], after[key])) preferences.set[key] = after[key];
  }

  return {
    notes: mapChanges(before.notes, after.notes),
    bookmarks: bookmarkChanges,
    categories: same(before.categories, after.categories) ? null : after.categories,
    noteTypes: same(before.noteTypes, after.noteTypes) ? null : (after.noteTypes || []),
    trash: trashChanges,
    preferences
  };
}

/** Apply a validated per-record change set to an aggregate compatibility view. */
export function applyVaultChanges(before, changes) {
  const applyList = (source, set) => {
    const values = new Map(source.map((item, index) => [item.id, { id: item.id, position: index, data: item }]));
    for (const id of set.delete) values.delete(id);
    for (const row of set.upsert) values.set(row.id, { id: row.id, position: row.position, data: row.data });
    return [...values.values()].sort(orderRows).map(row => row.data);
  };

  let bookmarks = flattenBookmarks(before.bookmarks || []);
  for (const id of changes.bookmarks.delete) bookmarks = bookmarks.filter(row => row.id !== id);
  for (const row of changes.bookmarks.upsert) {
    const index = bookmarks.findIndex(item => item.id === row.id);
    const value = { ...row, data: structuredClone(row.data) };
    if (index < 0) bookmarks.push(value); else bookmarks[index] = value;
  }

  const result = {
    ...before,
    notes: applyList(before.notes, changes.notes),
    bookmarks: bookmarksFromRows(bookmarks),
    trash: applyList(before.trash || [], changes.trash)
  };
  if (changes.categories !== null) result.categories = changes.categories;
  if (changes.noteTypes !== null) result.noteTypes = changes.noteTypes;
  for (const key of changes.preferences.delete) delete result[key];
  Object.assign(result, changes.preferences.set);
  return result;
}
