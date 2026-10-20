export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function createTrashEntry(kind, item, location = {}, extra = {}, deletedAt = Date.now()) {
  const uuid = globalThis.crypto?.randomUUID?.();
  const id = uuid ? `t${uuid.replaceAll('-', '')}` : `t${deletedAt.toString(36)}${Math.random().toString(36).slice(2, 14)}`;
  return {
    id,
    kind,
    deletedAt,
    item: structuredClone(item),
    parentId: location.parentId || '',
    index: Number.isSafeInteger(location.index) && location.index >= 0 ? location.index : 0,
    previousId: location.previousId || '',
    nextId: location.nextId || '',
    ...extra
  };
}

export function pruneExpiredTrash(data, now = Date.now()) {
  const before = Array.isArray(data.trash) ? data.trash : [];
  const after = before.filter(entry => now - entry.deletedAt < TRASH_RETENTION_MS);
  if (after.length === before.length) return 0;
  data.trash = after;
  return before.length - after.length;
}

function findBookmark(id, entries, parent = null) {
  for (const item of entries) {
    if (item.id === id) return { item, entries, parent };
    if (item.kind === 'folder') {
      const found = findBookmark(id, item.children, item);
      if (found) return found;
    }
  }
  return null;
}

function insertByLocation(entries, item, location) {
  const nextIndex = location.nextId ? entries.findIndex(entry => entry.id === location.nextId) : -1;
  const previousIndex = location.previousId ? entries.findIndex(entry => entry.id === location.previousId) : -1;
  const index = nextIndex >= 0 ? nextIndex : previousIndex >= 0 ? previousIndex + 1 : Math.min(location.index, entries.length);
  entries.splice(index, 0, item);
}

export function restoreTrashEntry(data, trashId) {
  const trash = Array.isArray(data.trash) ? data.trash : [];
  const entryIndex = trash.findIndex(entry => entry.id === trashId);
  if (entryIndex < 0) throw new Error('回收站项目已变更，请刷新后重试');
  const entry = trash[entryIndex];

  if (entry.kind === 'note') {
    if (data.notes.some(note => note.id === entry.item.id)) throw new Error('同编号笔记已存在，无法还原');
    const item = structuredClone(entry.item);
    if (!data.noteTypes.some(type => type.id === item.type)) item.type = data.noteTypes[0]?.id || 'note';
    insertByLocation(data.notes, item, entry);
  } else if (entry.kind === 'bookmark') {
    const parent = entry.parentId ? findBookmark(entry.parentId, data.bookmarks) : null;
    if (entry.parentId && parent?.item.kind !== 'folder') throw new Error('原分组尚未还原；请先还原上级分组');
    const destination = parent ? parent.item.children : data.bookmarks;
    const item = structuredClone(entry.item);
    if (item.kind === 'folder' && Array.isArray(entry.releasedChildren)) {
      const released = new Set(entry.releasedChildren);
      const children = destination.filter(child => released.has(child.id));
      for (const child of children) destination.splice(destination.indexOf(child), 1);
      item.children = [...(item.children || []), ...children];
    }
    insertByLocation(destination, item, entry);
  } else {
    throw new Error('回收站项目类型无效');
  }

  data.trash = trash.filter((_, index) => index !== entryIndex);
  return entry;
}
