const ASSET_REFERENCE_PATTERN = /\/api\/assets\/([a-f\d-]{36})(?:\?download=1)?/gi;

function serialized(value) {
  return typeof value === 'string' ? value : JSON.stringify(value ?? '');
}

function referenceCounts(value) {
  const counts = new Map();
  for (const match of serialized(value).matchAll(ASSET_REFERENCE_PATTERN)) {
    const id = match[1].toLowerCase();
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

export function collectAssetReferences(value, target = new Set()) {
  for (const id of referenceCounts(value).keys()) target.add(id);
  return target;
}

function recordReferences(vault) {
  const records = new Map();
  const add = (collection, record) => {
    if (!record || typeof record.id !== 'string') return;
    const data = collection === 'bookmarks'
      ? Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'children'))
      : record;
    records.set(collection + '\0' + record.id, referenceCounts(data));
  };

  for (const note of vault.notes || []) add('notes', note);
  const visitBookmarks = items => {
    for (const item of items || []) {
      add('bookmarks', item);
      if (item.kind === 'folder') visitBookmarks(item.children);
    }
  };
  visitBookmarks(vault.bookmarks);
  for (const item of vault.trash || []) add('trash', item);
  return records;
}

/** Return attachment IDs whose occurrence count increased within a vault record. */
export function findAddedAssetReferences(before, after) {
  const previous = recordReferences(before);
  const next = recordReferences(after);
  const added = new Set();
  for (const [key, counts] of next) {
    const oldCounts = previous.get(key) || new Map();
    for (const [id, count] of counts) {
      if (count > (oldCounts.get(id) || 0)) added.add(id);
    }
  }
  return [...added];
}
