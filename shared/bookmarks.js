// Shared by browser imports and authenticated vault validation.
export const MAX_BOOKMARK_ITEMS = 10000;
export const MAX_BOOKMARK_DEPTH = 32;
const ASSET_URL = /^\/api\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function bookmarkURL(value) {
  if (typeof value !== 'string' || value.length > 2048) throw Error('网址过长或无效');
  let url;
  try { url = new URL(value.trim()); } catch { throw Error('请输入完整网址（https://…）'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('书签只支持不含登录凭据的 HTTP / HTTPS 网址');
  return url.href;
}

export function validateBookmarks(input = []) {
  const ids = new Set(); let count = 0;
  function walk(items, depth) {
    if (!Array.isArray(items) || depth > MAX_BOOKMARK_DEPTH) throw Error('书签分组结构无效或超过 32 层');
    return items.map(item => {
      if (++count > MAX_BOOKMARK_ITEMS) throw Error(`书签和分组总数不能超过 ${MAX_BOOKMARK_ITEMS}`);
      if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) || ids.has(item.id)) throw Error('书签编号无效或重复');
      ids.add(item.id);
      if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 500) throw Error('书签名称须为 1–500 个字符');
      const base = { id: item.id, title: item.title.trim(), kind: item.kind };
      if (item.kind === 'folder') return { ...base, children: walk(item.children, depth + 1) };
      if (item.kind === 'link') {
        const link = { ...base, url: bookmarkURL(item.url), ...(item.pinned === true ? { pinned: true } : {}) };
        if (item.description !== undefined) {
          if (typeof item.description !== 'string' || item.description.length > 2000) throw Error('书签摘要不能超过 2000 个字符');
          link.description = item.description;
        }
        if (item.favicon !== undefined) {
          if (typeof item.favicon !== 'string' || (item.favicon !== '' && !ASSET_URL.test(item.favicon))) throw Error('书签图标地址无效');
          link.favicon = item.favicon;
        }
        return link;
      }
      throw Error('书签类型无效');
    });
  }
  return walk(input, 0);
}

/** Preserve metadata when an older client rewrites a matching bookmark without fields it does not know. */
export function preserveLegacyBookmarkMetadata(current, incoming) {
  const previous = new Map();
  const collect = items => {
    for (const item of items || []) {
      if (item.kind === 'link') previous.set(item.id, item);
      else if (item.kind === 'folder') collect(item.children);
    }
  };
  collect(current.bookmarks);
  for (const entry of current.trash || []) if (entry.kind === 'bookmark') {
    const item = entry.item;
    if (item.kind === 'link') previous.set(item.id, item);
    else if (item.kind === 'folder') collect([item]);
  }

  const preserveItems = items => (items || []).map(item => {
    if (item.kind === 'folder') return { ...item, children: preserveItems(item.children) };
    const old = previous.get(item.id);
    if (!old) return item;
    let sameURL = false;
    try { sameURL = bookmarkURL(old.url) === bookmarkURL(item.url); } catch {}
    if (!sameURL) return item;
    const next = { ...item };
    for (const key of ['description', 'favicon']) {
      if (!Object.hasOwn(next, key) && Object.hasOwn(old, key)) next[key] = old[key];
    }
    return next;
  });

  const trash = (incoming.trash || []).map(entry => entry.kind === 'bookmark'
    ? { ...entry, item: entry.item.kind === 'folder'
      ? { ...entry.item, children: preserveItems(entry.item.children) }
      : preserveItems([entry.item])[0] }
    : entry);
  return { ...incoming, bookmarks: preserveItems(incoming.bookmarks), trash };
}
