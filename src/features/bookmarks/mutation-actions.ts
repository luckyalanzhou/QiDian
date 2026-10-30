import type { BookmarkAction, BookmarkBulkDialogState, BookmarkDeleteDialogState, BookmarkDeleteRequest, BookmarkEditorDraft, BookmarkEditorOpenDraft, BookmarkImportDialogState } from './types';
import type { VaultMutationPort } from '../vault/mutation.ts';
import { moveBookmark, toggleBookmarkPin } from './operations.ts';
import { bookmarkId, bookmarksHTML, mergeBookmarks, parseBookmarks } from './data.js';
import { bookmarkURL } from '../../../shared/bookmarks.js';
import type { BookmarkItem, BookmarkMetadata, BookmarkMetadataIcon, VaultData } from '../../../shared/api-contracts.js';
import { bookmarkFolderPaths, bookmarkLinkCount, locateBookmark } from './snapshot.ts';
import type { BookmarkViewState } from './snapshot.ts';
import { createTrashEntry } from '../../domain/trash-data.js';
import { validateVault } from '../../../shared/vault-validation.js';

type Dependencies = {
  getBookmarks: () => Parameters<typeof toggleBookmarkPin>[0];
  getVault: () => VaultData;
  getEditor: () => BookmarkEditorDraft | null;
  getDeleteDialog: () => BookmarkDeleteDialogState | null;
  getBulkDialog: () => BookmarkBulkDialogState | null;
  getImportDialog: () => BookmarkImportDialogState | null;
  getSelectedVisibleIds: () => string[];
  viewState: BookmarkViewState;
  openEditor: (draft: BookmarkEditorOpenDraft) => void;
  closeEditor: () => void;
  openDeleteDialog: (request: BookmarkDeleteRequest) => void;
  closeDeleteDialog: () => void;
  resetAfterClear: () => void;
  reconcileAfterDelete: (deletedIds: string[], parentId: string) => void;
  clearSelection: (ids: string[]) => void;
  openBulkDialog: (mode: BookmarkBulkDialogState['mode'], ids: string[]) => void;
  closeBulkDialog: () => void;
  openImportDialog: (draft: Omit<BookmarkImportDialogState, 'error' | 'saving'>) => void;
  closeImportDialog: () => void;
  download: (blob: Blob, name: string) => void;
  parseImport: typeof parseBookmarks;
  mergeImport: typeof mergeBookmarks;
  serializeExport: typeof bookmarksHTML;
  setEditorError: (message: string) => void;
  mutation: VaultMutationPort;
  notify: (message: string) => void;
  fetchMetadata?: (url: string) => Promise<BookmarkMetadata>;
  uploadAsset?: (file: File) => Promise<{ url: string }>;
};

export function createBookmarkMutationActions(dependencies: Dependencies) {
  let pendingDeleteSnapshot = '';
  let pendingBulkSnapshot = '';
  let pendingImportSnapshot = '';
  let metadataRequestVersion = 0;

  function openNewEditor(kind: 'folder' | 'link', parentId = '') {
    metadataRequestVersion++;
    dependencies.openEditor({ kind, id: '', parentId, title: '', url: '' });
    return true;
  }

  function editItem(id: string) {
    const found = locateBookmark(id, dependencies.getBookmarks());
    if (!found) return true;
    metadataRequestVersion++;
    dependencies.openEditor({
      kind: found.item.kind,
      id: found.item.id,
      parentId: found.parent?.id || '',
      title: found.item.title,
      url: found.item.kind === 'link' ? found.item.url : '',
      description: found.item.kind === 'link' ? found.item.description || '' : ''
    });
    return true;
  }

  function containsFolder(items: BookmarkItem[], targetId: string): boolean {
    return items.some(item => item.kind === 'folder' && (item.id === targetId || containsFolder(item.children, targetId)));
  }

  function updateFromEditor(items: BookmarkItem[], form: BookmarkEditorDraft): { items: BookmarkItem[]; id: string; url: string } {
    const title = form.title.trim();
    if (!title) throw new Error('请输入名称');
    if (title.length > 500) throw new Error('名称不能超过 500 个字符');

    const next = structuredClone(items);
    const existing = form.id ? locateBookmark(form.id, next) : undefined;
    if (form.id && !existing) throw new Error('书签已变更，请关闭窗口后重新打开');
    if (existing && existing.item.kind !== form.kind) throw new Error('书签类型已变更，请重新打开');

    if (form.parentId) {
      const target = locateBookmark(form.parentId, next)?.item;
      if (target?.kind !== 'folder') throw new Error('目标分组已变更，请重新选择');
      if (existing?.item.kind === 'folder' && containsFolder(existing.item.children, form.parentId)) {
        throw new Error('不能将分组移动到自身或其子分组中');
      }
    }

    const item: BookmarkItem = existing
      ? { ...existing.item, title }
      : form.kind === 'folder'
        ? { id: bookmarkId(), kind: 'folder', title, children: [] }
        : { id: bookmarkId(), kind: 'link', title, url: '' };
    let url = '';
    if (item.kind === 'link') {
      url = bookmarkURL(form.url);
      const changedURL = existing?.item.kind === 'link' && bookmarkURL(existing.item.url) !== url;
      if (changedURL) {
        delete item.description;
        delete item.favicon;
      }
      item.url = url;
      if (form.descriptionEdited || form.metadataFetchedFor === url) {
        if (form.description.trim()) item.description = form.description.trim();
        else if (form.descriptionEdited) item.description = '';
        else delete item.description;
      }
    }

    if (existing) {
      const index = existing.entries.indexOf(existing.item);
      if ((existing.parent?.id || '') === form.parentId) {
        existing.entries[index] = item;
        return { items: next, id: item.id, url };
      }
      existing.entries.splice(index, 1);
    }

    const destination = form.parentId ? locateBookmark(form.parentId, next)?.item : null;
    if (form.parentId && destination?.kind !== 'folder') throw new Error('目标分组已变更，请重新选择');
    (destination?.kind === 'folder' ? destination.children : next).push(item);
    return { items: next, id: item.id, url };
  }

  function setEditorUrl(value: string) {
    const form = dependencies.getEditor();
    if (!form || form.kind !== 'link') return true;
    if (form.url !== value) {
      metadataRequestVersion++;
      if (form.metadataFetchedFor) {
        if (!form.titleEdited) form.title = form.initialTitle;
        if (!form.descriptionEdited) form.description = form.initialDescription;
      }
      form.pendingFavicon = null;
      form.metadataFetchedFor = '';
      form.metadataError = '';
      form.metadataLoading = false;
    }
    form.url = value;
    return true;
  }

  async function fetchEditorMetadata(value: string) {
    const form = dependencies.getEditor();
    if (!form || form.kind !== 'link') return true;
    let url: string;
    try { url = bookmarkURL(value); }
    catch (error) { form.metadataError = error instanceof Error ? error.message : '网址无效'; return true; }
    const requestVersion = ++metadataRequestVersion;
    form.metadataLoading = true;
    form.metadataError = '';
    try {
      if (!dependencies.fetchMetadata) throw new Error('自动获取暂不可用');
      const metadata = await dependencies.fetchMetadata(url);
      if (requestVersion !== metadataRequestVersion || dependencies.getEditor() !== form || form.url !== url) return true;
      if (!form.titleEdited && metadata.title.trim()) form.title = metadata.title;
      if (!form.descriptionEdited) form.description = metadata.description;
      form.pendingFavicon = metadata.favicon;
      form.metadataFetchedFor = url;
    } catch {
      if (requestVersion === metadataRequestVersion && dependencies.getEditor() === form && form.url === url) {
        form.metadataError = '无法自动获取信息，可继续手动填写。';
      }
    } finally {
      if (requestVersion === metadataRequestVersion && dependencies.getEditor() === form) form.metadataLoading = false;
    }
    return true;
  }

  function faviconFile(icon: BookmarkMetadataIcon): File {
    const bytes = Uint8Array.from(atob(icon.data), character => character.charCodeAt(0));
    const extension = ({
      'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
      'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico'
    } as const)[icon.mime];
    return new File([bytes], `bookmark-favicon.${extension}`, { type: icon.mime });
  }

  async function saveEditor() {
    const form = dependencies.getEditor();
    if (!form || form.saving) return true;
    form.saving = true;
    form.error = '';
    try {
      if (form.metadataLoading) throw new Error('正在获取网页信息，请稍后保存');
      const updated = updateFromEditor(dependencies.getBookmarks(), form);
      let bookmarks = validateVault({ ...dependencies.getVault(), bookmarks: updated.items }).bookmarks || [];
      const currentIcon = form.pendingFavicon && form.metadataFetchedFor === updated.url ? form.pendingFavicon : null;
      if (currentIcon) {
        if (!dependencies.uploadAsset) throw new Error('图标保存暂不可用，请重试');
        const asset = await dependencies.uploadAsset(faviconFile(currentIcon));
        const link = locateBookmark(updated.id, bookmarks)?.item;
        if (link?.kind === 'link') link.favicon = asset.url;
      }
      const transaction = dependencies.mutation.execute(vault => { vault.bookmarks = bookmarks; });
      await transaction.persisted;
      form.saving = false;
      dependencies.closeEditor();
    } catch (error) {
      form.saving = false;
      dependencies.setEditorError(error instanceof Error && error.message ? error.message : '书签保存失败');
    }
    return true;
  }

  async function persistBookmarkChange(
    action: Extract<BookmarkAction, { type: 'toggle-pin' | 'move' }>
  ) {
    const current = dependencies.getBookmarks();
    const updated = action.type === 'toggle-pin'
      ? toggleBookmarkPin(current, action.id)
      : moveBookmark(current, action.id, action.direction);
    if (!updated) return true;

    const transaction = dependencies.mutation.execute(vault => {
      vault.bookmarks = updated;
    });
    try {
      await transaction.persisted;
    } catch (error) {
      const fallback = action.type === 'toggle-pin' ? '常用状态尚未保存' : '书签顺序尚未保存';
      dependencies.notify(error instanceof Error && error.message ? error.message : fallback);
    }
    return true;
  }

  async function persistViewPreference(action: Extract<BookmarkAction, { type: 'toggle-folder' | 'toggle-directory' }>) {
    const vault = dependencies.getVault();
    if (action.type === 'toggle-directory') {
      if (dependencies.viewState.directoryOpen === action.open) return true;
      const previous = dependencies.viewState.directoryOpen;
      dependencies.viewState.directoryOpen = action.open;
      try {
        const mutation = dependencies.mutation.execute(candidate => { candidate.bookmarkDirectoryOpen = action.open; });
        await mutation.persisted;
      } catch (error) {
        dependencies.viewState.directoryOpen = previous;
        dependencies.notify(error instanceof Error && error.message ? error.message : '目录状态尚未保存');
      }
      return true;
    }
    if (locateBookmark(action.id, vault.bookmarks)?.item.kind !== 'folder') return true;
    const folderStates = vault.bookmarkFolderStates || {};
    const current = Object.hasOwn(folderStates, action.id)
      ? folderStates[action.id]
      : !dependencies.viewState.isMobile && !dependencies.viewState.closed.has(action.id);
    const next = !current;
    try {
      const mutation = dependencies.mutation.execute(candidate => {
        candidate.bookmarkFolderStates = { ...(candidate.bookmarkFolderStates || {}), [action.id]: next };
      });
      await mutation.persisted;
    } catch (error) {
      dependencies.notify(error instanceof Error && error.message ? error.message : '分组状态尚未保存');
    }
    return true;
  }

  function countFolders(items: BookmarkItem[]): number {
    return items.reduce((count, item) => count + (item.kind === 'folder' ? 1 + countFolders(item.children) : 0), 0);
  }

  function bookmarkIds(items: BookmarkItem[]): string[] {
    return items.flatMap(item => [item.id, ...(item.kind === 'folder' ? bookmarkIds(item.children) : [])]);
  }

  function openDelete(id: string) {
    const found = locateBookmark(id, dependencies.getBookmarks());
    if (!found) return true;
    const request: BookmarkDeleteRequest = {
      kind: 'item', id, itemKind: found.item.kind, title: found.item.title,
      hasChildren: found.item.kind === 'folder' && found.item.children.length > 0
    };
    pendingDeleteSnapshot = JSON.stringify(dependencies.getVault());
    dependencies.openDeleteDialog(request);
    return true;
  }

  function openClear() {
    const bookmarks = dependencies.getBookmarks();
    if (!bookmarks.length) return true;
    const request: BookmarkDeleteRequest = {
      kind: 'all', linkCount: bookmarkLinkCount(bookmarks), folderCount: countFolders(bookmarks)
    };
    pendingDeleteSnapshot = JSON.stringify(dependencies.getVault());
    dependencies.openDeleteDialog(request);
    return true;
  }

  async function confirmDelete() {
    const dialog = dependencies.getDeleteDialog();
    if (!dialog || dialog.saving) return true;
    dialog.saving = true;
    dialog.error = '';
    try {
      const currentVault = dependencies.getVault();
      if (!pendingDeleteSnapshot || JSON.stringify(currentVault) !== pendingDeleteSnapshot) {
        throw new Error('内容已变更，请关闭窗口后重新确认');
      }
      const request = dialog.request;
      let deletedIds: string[] = [];
      let parentId = '';
      const mutation = dependencies.mutation.execute(candidate => {
        if (request.kind === 'all') {
          const removed = structuredClone(candidate.bookmarks || []);
          const trash = candidate.trash || [];
          candidate.trash = trash;
          const deletedAt = Date.now();
          removed.forEach((item, index) => trash.push(createTrashEntry('bookmark', item, {
            parentId: '', index, previousId: removed[index - 1]?.id || '', nextId: removed[index + 1]?.id || ''
          }, {}, deletedAt)));
          candidate.bookmarks = [];
          candidate.bookmarkFolderStates = {};
          return;
        }
        const found = locateBookmark(request.id, candidate.bookmarks);
        if (!found) throw new Error('内容已变更，请关闭窗口后重新确认');
        parentId = found.parent?.id || '';
        const index = found.entries.indexOf(found.item);
        const location = {
          parentId: found.parent?.id || '', index,
          previousId: found.entries[index - 1]?.id || '',
          nextId: found.entries[index + 1]?.id || ''
        };
        const folderChildren = found.item.kind === 'folder' ? found.item.children : [];
        const keepChildren = request.hasChildren && dialog.mode === 'keep' && folderChildren.length > 0;
        deletedIds = keepChildren ? [found.item.id] : bookmarkIds([found.item]);
        const releasedChildren = keepChildren ? folderChildren.map(child => child.id) : null;
        const trashedItem = releasedChildren && found.item.kind === 'folder' ? { ...found.item, children: [] } : found.item;
        const trash = candidate.trash || [];
        candidate.trash = trash;
        trash.push(createTrashEntry('bookmark', trashedItem, location,
          releasedChildren ? { releasedChildren } : {}));
        found.entries.splice(index, 1, ...(keepChildren ? folderChildren : []));
      });
      await mutation.persisted;
      dialog.saving = false;
      if (request.kind === 'all') dependencies.resetAfterClear();
      else dependencies.reconcileAfterDelete(deletedIds, parentId);
      dependencies.closeDeleteDialog();
      pendingDeleteSnapshot = '';
      dependencies.notify(request.kind === 'all' ? '已将全部书签移入回收站' : '已移入回收站');
    } catch (error) {
      dialog.error = error instanceof Error && error.message ? error.message : '书签删除失败';
    } finally {
      dialog.saving = false;
    }
    return true;
  }

  function openBulk(mode: BookmarkBulkDialogState['mode']) {
    const ids = [...new Set(dependencies.getSelectedVisibleIds())];
    if (!ids.length) return true;
    pendingBulkSnapshot = JSON.stringify(dependencies.getVault());
    dependencies.openBulkDialog(mode, ids);
    return true;
  }

  async function confirmBulk() {
    const dialog = dependencies.getBulkDialog();
    if (!dialog || dialog.saving) return true;
    dialog.saving = true;
    dialog.error = '';
    try {
      const current = dependencies.getVault();
      if (!pendingBulkSnapshot || JSON.stringify(current) !== pendingBulkSnapshot) {
        throw new Error('内容已变更，请关闭窗口后重新确认');
      }
      const ids = [...dialog.ids];
      const locations = new Map(ids.map(id => {
        const found = locateBookmark(id, current.bookmarks);
        const index = found?.entries.indexOf(found.item) ?? -1;
        return [id, found ? {
          parentId: found.parent?.id || '', index,
          previousId: found.entries[index - 1]?.id || '',
          nextId: found.entries[index + 1]?.id || ''
        } : null] as const;
      }));
      const mutation = dependencies.mutation.execute(candidate => {
        const items = structuredClone(candidate.bookmarks || []);
        const moving: BookmarkItem[] = [];
        const trash = candidate.trash || [];
        candidate.trash = trash;
        const deletedAt = Date.now();
        for (const id of ids) {
          const found = locateBookmark(id, items);
          const location = locations.get(id);
          if (!found || found.item.kind !== 'link') throw new Error('所选书签已变更');
          if (!location) throw new Error('所选书签位置已变更');
          moving.push(found.item);
          if (dialog.mode === 'delete') trash.push(createTrashEntry('bookmark', found.item, location, {}, deletedAt));
          found.entries.splice(found.entries.indexOf(found.item), 1);
        }
        if (dialog.mode === 'move') {
          const destination = dialog.targetId ? locateBookmark(dialog.targetId, items)?.item : null;
          if (dialog.targetId && destination?.kind !== 'folder') throw new Error('目标分组已变更，请重新选择');
          (destination?.kind === 'folder' ? destination.children : items).push(...moving);
        }
        candidate.bookmarks = items;
      });
      await mutation.persisted;
      dialog.saving = false;
      dependencies.clearSelection(ids);
      dependencies.closeBulkDialog();
      pendingBulkSnapshot = '';
      dependencies.notify(dialog.mode === 'delete' ? `已将 ${ids.length} 个网址移入回收站` : `已移动 ${ids.length} 个网址`);
    } catch (error) {
      dialog.error = error instanceof Error && error.message ? error.message : '批量操作失败';
    } finally {
      dialog.saving = false;
    }
    return true;
  }

  async function importFile(file: File) {
    if (!file || file.size > 5 * 1024 * 1024) {
      dependencies.notify('书签文件不能超过 5 MB');
      return true;
    }
    try {
      const parsed = dependencies.parseImport(await file.text());
      const preview = dependencies.mergeImport(dependencies.getBookmarks(), parsed.items);
      const validated = validateVault({ ...dependencies.getVault(), bookmarks: preview.items });
      pendingImportSnapshot = JSON.stringify(dependencies.getVault());
      dependencies.openImportDialog({
        items: validated.bookmarks || [],
        folders: bookmarkFolderPaths(parsed.items),
        added: preview.added,
        duplicates: preview.duplicates,
        skipped: parsed.skipped
      });
    } catch (error) {
      dependencies.notify(error instanceof Error && error.message ? error.message : '无法读取书签文件');
    }
    return true;
  }

  async function confirmImport() {
    const dialog = dependencies.getImportDialog();
    if (!dialog || dialog.saving) return true;
    dialog.saving = true;
    dialog.error = '';
    try {
      if (!pendingImportSnapshot || JSON.stringify(dependencies.getVault()) !== pendingImportSnapshot) {
        throw new Error('知识库已变更，请重新选择文件预览');
      }
      const mutation = dependencies.mutation.execute(vault => { vault.bookmarks = dialog.items; });
      await mutation.persisted;
      dialog.saving = false;
      dependencies.closeImportDialog();
      pendingImportSnapshot = '';
      dependencies.notify(`已导入 ${dialog.added} 个书签`);
    } catch (error) {
      dialog.error = error instanceof Error && error.message ? error.message : '导入书签失败';
    } finally {
      dialog.saving = false;
    }
    return true;
  }

  async function execute(action: BookmarkAction): Promise<boolean> {
    switch (action.type) {
      case 'add-link': return openNewEditor('link', action.parentId || '');
      case 'add-folder': return openNewEditor('folder', action.parentId || '');
      case 'edit': return editItem(action.id);
      case 'save-editor': return saveEditor();
      case 'set-editor-url': return setEditorUrl(action.value);
      case 'set-editor-title': {
        const form = dependencies.getEditor(); if (form) { form.title = action.value; form.titleEdited = true; }
        return true;
      }
      case 'set-editor-description': {
        const form = dependencies.getEditor(); if (form) { form.description = action.value; form.descriptionEdited = true; }
        return true;
      }
      case 'fetch-metadata': return fetchEditorMetadata(action.url);
      case 'toggle-folder':
      case 'toggle-directory': return persistViewPreference(action);
      case 'delete': return openDelete(action.id);
      case 'clear': return openClear();
      case 'confirm-delete': return confirmDelete();
      case 'bulk-move': return openBulk('move');
      case 'bulk-delete': return openBulk('delete');
      case 'confirm-bulk': return confirmBulk();
      case 'import': return true;
      case 'import-file': return importFile(action.file);
      case 'confirm-import': return confirmImport();
      case 'export':
        dependencies.download(new Blob([dependencies.serializeExport(dependencies.getBookmarks())], { type: 'text/html;charset=utf-8' }), '栖点-书签.html');
        return true;
      case 'toggle-pin':
      case 'move': return persistBookmarkChange(action);
      default: return false;
    }
  }

  return { execute };
}
