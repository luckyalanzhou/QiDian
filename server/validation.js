import { validateBookmarks } from './bookmarks.js';
export const MAX_VAULT_BYTES = 1_000_000;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const DEFAULT_NOTE_TYPES = [
  { id: 'note', name: '普通笔记' },
  { id: 'clip', name: '网页收藏' },
  { id: 'command', name: '命令速查' },
  { id: 'issue', name: '故障排查' }
];
function text(value, max, label) {
  if (typeof value !== 'string' || value.length > max) throw new HttpError(400, `${label}格式或长度无效`);
  return value;
}
function bookmarkPreferenceId(value) { return typeof value === 'string' && value.length <= 100 && /^[a-zA-Z0-9_-]+$/.test(value); }
function dashboardFolderPreferences(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 10000) throw new HttpError(400, '首页书签展开偏好无效');
  const result = {};
  for (const [id, open] of Object.entries(value)) {
    if (!bookmarkPreferenceId(id) || typeof open !== 'boolean') throw new HttpError(400, '首页书签展开偏好无效');
    result[id] = open;
  }
  return result;
}
function bookmarkFolderPreferences(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 10000) throw new HttpError(400, '书签目录展开偏好无效');
  const result = {};
  for (const [id, open] of Object.entries(value)) {
    if (!bookmarkPreferenceId(id) || typeof open !== 'boolean') throw new HttpError(400, '书签目录展开偏好无效');
    result[id] = open;
  }
  return result;
}
export function validateVault(input) {
  if (!input || !Array.isArray(input.notes) || !Array.isArray(input.categories)) throw new HttpError(400, '备份结构无效');
  if (input.notes.length > 10000 || input.categories.length > 300 || (input.noteTypes !== undefined && (!Array.isArray(input.noteTypes) || input.noteTypes.length < 1 || input.noteTypes.length > 50))) throw new HttpError(400, '笔记、分类或类型数量超限');
  const ids = new Set();
  const categories = [...new Set(input.categories.map(v => text(v, 30, '分类')))];
  const sourceTypes = input.noteTypes === undefined ? DEFAULT_NOTE_TYPES : input.noteTypes;
  const typeIds = new Set(), typeNames = new Set();
  const noteTypes = sourceTypes.map(item => {
    if (!item || typeof item !== 'object') throw new HttpError(400, '笔记类型无效');
    const id = text(item.id, 32, '笔记类型编号'), name = text(item.name, 30, '笔记类型名称').trim();
    if (!/^[a-z][a-z0-9_-]*$/.test(id) || ['all','recent','pinned'].includes(id) || typeIds.has(id) || !name || typeNames.has(name.toLocaleLowerCase())) throw new HttpError(400, '笔记类型编号或名称无效或重复');
    typeIds.add(id); typeNames.add(name.toLocaleLowerCase());
    return { id, name };
  });
  if (!noteTypes.length) throw new HttpError(400, '至少保留一种笔记类型');
  const notes = input.notes.map(n => {
    if (!n || !Array.isArray(n.tags) || n.tags.length > 30) throw new HttpError(400, '标签无效');
    const id = text(n.id, 100, '编号');
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) throw new HttpError(400, '笔记编号无效或重复');
    ids.add(id);
    if (!typeIds.has(n.type)) throw new HttpError(400, '笔记类型无效');
    if (![n.created, n.updated].every(v => Number.isSafeInteger(v) && v >= 0)) throw new HttpError(400, '笔记时间无效');
    const status = n.status === undefined ? 'published' : n.status;
    if (!['draft', 'published'].includes(status)) throw new HttpError(400, '笔记状态无效');
    const normalizeVersion = version => {
      if (!version || typeof version !== 'object' || !Array.isArray(version.tags) || version.tags.length > 30) throw new HttpError(400, '已发布版本无效');
      if (!typeIds.has(version.type) || !Number.isSafeInteger(version.updated) || version.updated < 0) throw new HttpError(400, '已发布版本无效');
      return { title: text(version.title, 500, '标题'), type: version.type, category: text(version.category, 30, '分类'),
        tags: [...new Set(version.tags.map(v => text(v, 100, '标签')))], body: text(version.body, MAX_VAULT_BYTES, '正文'),
        source: text(version.source || '', 2048, '来源'), updated: version.updated };
    };
    const note = { id, title: text(n.title, 500, '标题'), type: n.type, category: text(n.category, 30, '分类'),
      tags: [...new Set(n.tags.map(v => text(v, 100, '标签')))], body: text(n.body, MAX_VAULT_BYTES, '正文'),
      source: text(n.source || '', 2048, '来源'), created: n.created, updated: n.updated, pinned: !!n.pinned };
    if (n.status !== undefined) note.status = status;
    if (status === 'draft') note.publishedAt = null;
    else if (n.publishedAt !== undefined) {
      if (!Number.isSafeInteger(n.publishedAt) || n.publishedAt < 0) throw new HttpError(400, '发布时间无效');
      note.publishedAt = n.publishedAt;
    }
    if (n.publishedSnapshot !== undefined) {
      if (status !== 'published') throw new HttpError(400, '草稿不能包含已发布版本');
      note.publishedSnapshot = normalizeVersion(n.publishedSnapshot);
    }
    return note;
  });
  let bookmarks;
  try { bookmarks = validateBookmarks(input.bookmarks); } catch (error) { throw new HttpError(400, error.message); }
  const data = { categories, noteTypes, notes, bookmarks, theme: ['system','light','dark'].includes(input.theme) ? input.theme : 'light',
    pasteMode: ['rich','match','plain'].includes(input.pasteMode) ? input.pasteMode : 'rich',
    noteTypesExpanded: input.noteTypesExpanded !== false,
    dashboardBookmarkLayout: input.dashboardBookmarkLayout === 'double' ? 'double' : 'single',
    dashboardBookmarkFolders: dashboardFolderPreferences(input.dashboardBookmarkFolders),
    bookmarkDirectoryOpen: typeof input.bookmarkDirectoryOpen === 'boolean' ? input.bookmarkDirectoryOpen : null,
    bookmarkFolderStates: bookmarkFolderPreferences(input.bookmarkFolderStates) };
  if (new TextEncoder().encode(JSON.stringify(data)).byteLength > MAX_VAULT_BYTES) throw new HttpError(413, '当前整库正文上限为 1 MB，请导出备份；后续将迁移为逐篇存储');
  return data;
}
