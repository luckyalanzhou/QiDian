import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createDashboardActions } from '../../../src/features/dashboard/actions.ts';
import { mountWorkspaceKeyboardEvents } from '../../../src/features/navigation/workspace-keyboard-events.ts';

async function waitForCondition(description, predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise(resolve => setTimeout(resolve, 1));
  }
}

test('bootstrap topbar search has an accessible name before Vue enhancement', async () => {
  const html = await readFile(new URL('../../../index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html);
  try {
    assert.equal(dom.window.document.querySelector('#searchTop')?.getAttribute('aria-label'), '搜索你的知识');
    assert.equal(dom.window.document.querySelector('#searchTop .shortcut'), null, 'the static bootstrap search does not show a platform-specific shortcut');
  } finally {
    dom.window.close();
  }
});

test('Meta+K opens global search and prevents the browser command shortcut', () => {
  const dom = new JSDOM('<!doctype html><body><input id="searchTop"></body>');
  try {
    let opens = 0;
    const detach = mountWorkspaceKeyboardEvents(dom.window.document, {
      isEditing:() => false,
      openGlobalSearch:() => { opens++; },
      saveDraft:() => undefined,
      updateEditorBaseline:() => undefined,
      closeSearch:() => undefined,
      closeCapture:() => undefined,
      closeCreateMenu:() => undefined,
      closeBackupHistory:() => undefined,
      closeAccountSettings:() => undefined,
      closeThemeMenu:() => undefined,
      closeAccountMenu:() => undefined,
      closeWorkspaceMenu:() => undefined,
      closeSlashMenu:() => undefined,
      openNote:() => undefined
    });
    const shortcut = new dom.window.KeyboardEvent('keydown', { key:'k', metaKey:true, bubbles:true, cancelable:true });
    dom.window.document.querySelector('#searchTop').dispatchEvent(shortcut);
    detach();

    assert.equal(opens, 1, 'Meta+K dispatches the same global-search action as Ctrl+K');
    assert.equal(shortcut.defaultPrevented, true, 'the browser must not also run its native search action');
  } finally {
    dom.window.close();
  }
});

test('Vue note list and cards dispatch navigation commands directly without document click routing', async t => {
  const require = createRequire(import.meta.url);
  const pluginEntry = require.resolve('@vitejs/plugin-vue');
  const compilerPath = require.resolve('@vue/compiler-sfc', { paths: [dirname(pluginEntry)] });
  const esbuildPath = require.resolve('esbuild', { paths: [dirname(pluginEntry)] });
  const { parse, compileScript } = require(compilerPath);
  const { build } = require(esbuildPath);
  const cacheDir = join(process.cwd(), 'node_modules', '.cache');
  await mkdir(cacheDir, { recursive: true });
  const tempDir = await mkdtemp(join(cacheDir, 'qidian-vue-component-test-'));
  const bundlePath = join(tempDir, 'notes-list-page.mjs');
  await build({
    stdin: {
    sourcefile: 'navigation-actions-components.test-entry.ts',
      resolveDir: process.cwd(),
      contents: [
        "export { default as NotesListPage } from './src/features/notes/NotesListPage.vue';",
        "export { default as BookmarkPage } from './src/features/bookmarks/BookmarkPage.vue';",
        "export { default as DashboardPage } from './src/features/dashboard/DashboardPage.vue';",
        "export { default as EditorPage } from './src/features/editor/EditorPage.vue';",
        "export { default as NoteTypeDialog } from './src/features/notes/NoteTypeDialog.vue';",
        "export { default as CaptureDialog } from './src/features/capture/CaptureDialog.vue';",
        "export { default as CreateMenuDialog } from './src/features/create-menu/CreateMenuDialog.vue';",
        "export { default as SidebarNavigation } from './src/features/navigation/SidebarNavigation.vue';",
        "export { default as MobileNavigation } from './src/features/navigation/MobileNavigation.vue';",
        "export { default as WorkspaceTopbarMenus } from './src/features/navigation/WorkspaceTopbarMenus.vue';",
        "export { default as GlobalSearchDialog } from './src/features/search/GlobalSearchDialog.vue';",
        "export { default as CommandPalette } from './src/features/command-palette/CommandPalette.vue';",
        "export { default as ReaderPage } from './src/features/reader/ReaderPage.vue';",
        "export { default as RecycleBinPage } from './src/features/trash/RecycleBinPage.vue';",
        "export { default as AppSettings } from './src/features/settings/AppSettings.vue';",
        "export { default as ProfileSettings } from './src/features/account/ProfileSettings.vue';",
        "export { default as BackupHistoryDialog } from './src/features/settings/BackupHistoryDialog.vue';",
        "export { default as BackupImportProgress } from './src/features/settings/BackupImportProgress.vue';",
        "export { default as SyncConflictDialog } from './src/features/sync/SyncConflictDialog.vue';",
        "export { useNavigationActionsStore } from './src/features/navigation/navigation-actions-store.ts';",
        "export { useNavigationStore } from './src/features/navigation/store.ts';",
        "export { useNoteListStore } from './src/features/notes/store.ts';",
        "export { useDashboardStore } from './src/features/dashboard/store.ts';",
        "export { useBookmarkStore } from './src/features/bookmarks/store.ts';",
        "export { useEditorStore } from './src/features/editor/store.ts';",
        "export { useEditorPageActionsStore } from './src/features/editor/editor-page-actions-store.ts';",
        "export { useNoteTypeDialogStore } from './src/features/notes/type-dialog-store.ts';",
        "export { useCaptureDialogStore } from './src/features/capture/capture-dialog-store.ts';",
        "export { useCreateMenuStore } from './src/features/create-menu/store.ts';",
        "export { useSidebarStore } from './src/features/navigation/sidebar-store.ts';",
        "export { useWorkspaceShellActionsStore } from './src/features/navigation/workspace-shell-actions-store.ts';",
        "export { useWorkspaceShellStore } from './src/features/navigation/workspace-shell-store.ts';",
        "export { useReaderStore } from './src/features/reader/store.ts';",
        "export { useTrashStore } from './src/features/trash/store.ts';",
        "export { useReaderActionsStore } from './src/features/reader/reader-actions-store.ts';",
        "export { useVaultStore } from './src/features/vault/store.ts';",
        "export { useAppSettingsStore } from './src/features/settings/app-settings-store.ts';",
        "export { useProfileSettingsStore } from './src/features/account/profile-settings-store.ts';",
        "export { useBackupHistoryStore } from './src/features/settings/backup-history-store.ts';",
        "export { useBackupImportStore } from './src/features/settings/backup-import-store.ts';",
        "export { useGlobalSearchStore } from './src/features/search/store.ts';",
        "export { useSyncConflictStore } from './src/features/sync/store.ts';",
        "export { useCommandPaletteStore } from './src/features/command-palette/store.ts';"
      ].join('\n')
    },
    outfile: bundlePath,
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    plugins: [{
      name: 'vue-sfc-client-compiler',
      setup(buildContext) {
        buildContext.onLoad({ filter: /\.vue$/ }, async args => {
          const source = await readFile(args.path, 'utf8');
          const { descriptor, errors } = parse(source, { filename: args.path });
          if (errors.length) throw errors[0];
          const compiled = compileScript(descriptor, { id: args.path, inlineTemplate: true });
          return { contents: compiled.content, loader: 'ts', resolveDir: dirname(args.path) };
        });
      }
    }]
  });
  const dom = new JSDOM('<div id="app"></div><button id="menuBtn">菜单</button><aside id="sidebar"><div id="sidebarBrandIsland"></div><div id="sidebarCreateIsland"></div><div id="qidianSidebarIsland"></div></aside><div id="topbarSearchIsland"></div><div id="topbarMenusIsland"></div><div class="workspace"><main id="dashboardHost"></main></div>', {
    url: 'http://localhost',
    pretendToBeVisual: true
  });
  Object.defineProperty(dom.window.navigator, 'platform', { configurable:true, value:'MacIntel' });
  const names = ['window', 'document', 'navigator', 'Document', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'MutationObserver', 'Event', 'getComputedStyle'];
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const name of names) {
    const value = name === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[name];
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }

  let app;
  let browserHistory;
  t.after(async () => {
    browserHistory?.dispose();
    app?.unmount();
    dom.window.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  const [{ createApp, h, Fragment, nextTick }, { createPinia }, { createBrowserHistoryController }, components] = await Promise.all([
    import('vue'),
    import('pinia'),
    import('../../../src/features/navigation/browser-history-controller.ts'),
    import(pathToFileURL(bundlePath).href)
  ]);
  const { NotesListPage, BookmarkPage, DashboardPage, EditorPage, ReaderPage, RecycleBinPage, AppSettings, ProfileSettings, BackupHistoryDialog, BackupImportProgress, SyncConflictDialog, NoteTypeDialog, CaptureDialog, CreateMenuDialog, SidebarNavigation, MobileNavigation, WorkspaceTopbarMenus, GlobalSearchDialog, CommandPalette, useNavigationActionsStore, useNavigationStore, useNoteListStore, useDashboardStore, useBookmarkStore, useEditorStore, useEditorPageActionsStore, useNoteTypeDialogStore, useCaptureDialogStore, useCreateMenuStore, useSidebarStore, useWorkspaceShellActionsStore, useWorkspaceShellStore, useReaderStore, useReaderActionsStore, useTrashStore, useVaultStore, useAppSettingsStore, useProfileSettingsStore, useBackupHistoryStore, useBackupImportStore, useGlobalSearchStore, useSyncConflictStore, useCommandPaletteStore } = components;
  const pinia = createPinia();
  const vault = useVaultStore(pinia);
  const navigation = useNavigationStore(pinia);
  const noteList = useNoteListStore(pinia);
  const dashboard = useDashboardStore(pinia);
  useTrashStore(pinia);
  const bookmarks = useBookmarkStore(pinia);
  const syncConflict = useSyncConflictStore(pinia);
  const bookmarkCommands = [];
  bookmarks.bindActions(action => {
    bookmarkCommands.push(action);
    if (action.type === 'add-link') bookmarks.openEditor({ kind: 'link', id: '', parentId: action.parentId || '', title: '', url: '' });
    if (action.type === 'set-editor-title' && bookmarks.editor) bookmarks.editor.title = action.value;
    if (action.type === 'set-editor-url' && bookmarks.editor) bookmarks.editor.url = action.value;
    if (action.type === 'set-editor-description' && bookmarks.editor) bookmarks.editor.description = action.value;
    if (action.type === 'delete') bookmarks.openDeleteDialog({ kind: 'item', id: action.id, itemKind: 'link', title: 'MDN', hasChildren: false });
    if (action.type === 'bulk-delete') bookmarks.openBulkDialog('delete', ['bookmark-mdn']);
  });
  const editorData = useEditorStore(pinia);
  const editorRuntimeActions = [];
  const editorPageActions = useEditorPageActionsStore(pinia);
  const editorPageCommands = [];
  editorPageActions.bind(command => { editorPageCommands.push(command); });
  const editorFormChanges = [];
  let editorFormBlurs = 0;
  editorData.bindRuntime({
    initialize() {}, dispatch(action) { editorRuntimeActions.push(action); },
    formChanged: () => editorFormChanges.push({ ...editorData.form }),
    formBlurred: () => { editorFormBlurs += 1; }
  });
  const noteTypeDialog = useNoteTypeDialogStore(pinia);
  const captureDialog = useCaptureDialogStore(pinia);
  const createMenu = useCreateMenuStore(pinia);
  const sidebar = useSidebarStore(pinia);
  const actions = useNavigationActionsStore(pinia);
  const shellActions = useWorkspaceShellActionsStore(pinia);
  const shell = useWorkspaceShellStore(pinia);
  const reader = useReaderStore(pinia);
  const readerActions = useReaderActionsStore(pinia);
  const appSettings = useAppSettingsStore(pinia);
  const appSettingsCommands = [];
  appSettings.bindActionHandler(action => appSettingsCommands.push(action));
  const profileSettings = useProfileSettingsStore(pinia);
  profileSettings.configure({
    local: true, username: '本地预览', getAccountProfile: async () => ({ id: 'local', username: '本地预览', created: 0, avatarMime: null }),
    getAccountAvatar: async () => new Blob(), saveAccountAvatar: async () => undefined,
    removeAccountAvatar: async () => undefined, changeAccountPassword: async () => undefined
  });
  const backupHistory = useBackupHistoryStore(pinia);
  const backupImport = useBackupImportStore(pinia);
  const backupActions = [];
  let backupSummaries = [{ revision: 2, created: 1 }];
  let listBackupSummaries = async () => backupSummaries;
  backupHistory.configure({ listBackups: () => listBackupSummaries(), localPreview: false, downloadSnapshot: async revision => backupActions.push(['download', revision]), restoreSnapshot: async revision => backupActions.push(['restore', revision]) });
  const note = {
    id: 'note-1', title: '路由配置', type: 'note', category: '网络', tags: ['OpenWrt'],
    body: '<h2 id="reader-heading">网关配置</h2><p>阅读页操作。</p>', source: 'javascript:alert(1)', created: 1, updated: 1, pinned: false, status: 'published',
    publishedSnapshot: { title: '已发布版本', type: 'note', category: '网络', tags: ['OpenWrt'], body: '<h2 id="reader-heading">网关配置</h2><p>阅读页操作。</p>', source: 'javascript:alert(1)', updated: 1 }
  };
  vault.replace({ categories: ['网络'], noteTypes: [{ id: 'note', name: '普通笔记' }, { id: 'command', name: '命令速查' }], notes: [note], bookmarks: [{ id: 'folder-reading', kind: 'folder', title: '阅读', children: [{ id: 'folder-reference', kind: 'folder', title: '参考', children: [{ id: 'bookmark-mdn', kind: 'link', title: 'MDN', url: 'https://developer.mozilla.org' }] }] }], dashboardBookmarkFolders: { 'folder-reading': false, 'folder-reference': false }, trash: [] });
  reader.configure({
    document: dom.window.document,
    readableNoteBody: body => ({ html: String(body || '') }),
    typeLabel: () => '普通笔记',
    formatDate: timestamp => `date-${timestamp}`,
    safeUrl: value => /^https?:\/\//.test(value),
    isDraft: () => false,
    needsPublish: () => true,
    publishedView: value => value.publishedSnapshot ? { ...value, ...value.publishedSnapshot } : value
  });
  navigation.page = 'home';
  sidebar.configure({
    isDraft: () => false,
    needsPublish: () => false,
    hasDraftContent: () => false,
    displayTypeName: type => type.name
  });
  noteList.configure({
    hasDraftContent: () => true,
    bodyText: body => body,
    typeName: () => '普通笔记',
    displayTypeName: type => type.name,
    noteCard: value => ({
      id: value.id, title: value.title, type: value.type, typeName: '普通笔记',
      tags: value.tags, description: '网关配置', updatedLabel: '今天', pinned: false
    })
  });
  dashboard.configure({
    isDraft: () => false,
    publishedView: value => value,
    noteCard: value => ({ id: value.id, title: value.title, type: value.type, typeName: '普通笔记', tags: value.tags, description: '网关配置', updatedLabel: '今天', pinned: false }),
    isSafeUrl: value => /^https?:\/\//.test(value)
  });
  let dashboardPersistCalls = 0;
  dashboard.bindActions(createDashboardActions({
    getVault: () => vault.value,
    mutateVault: operation => vault.mutate(operation),
    persist: () => { dashboardPersistCalls += 1; }
  }));
  const commands = [];
  const shellCommands = [];
  const readerCommands = [];
  actions.bind(command => { commands.push(command); if (command.type === 'create-from-menu') createMenu.closeForNavigation(); return true; });
  shellActions.bind(command => {
    shellCommands.push(command);
    shell.closeThemeMenu();
    shell.closeAccountMenu();
    if (command.type === 'toggle-theme-menu') shell.toggleThemeMenu();
    if (command.type === 'toggle-account-menu') shell.toggleAccountMenu();
    if (command.type === 'open-app-settings') appSettings.show();
    if (command.type === 'open-profile-settings') void profileSettings.show();
    if (command.type === 'apply-theme') { shell.setThemeState(command.theme, command.theme === 'dark'); shell.closeThemeMenu(); }
    return true;
  });
  readerActions.bind(command => { readerCommands.push(command); });
  app = createApp({
    render() {
      return h(Fragment, null, [
        h(WorkspaceTopbarMenus),
        h(CommandPalette),
        h(GlobalSearchDialog),
        h(SidebarNavigation),
        h(MobileNavigation),
        h(DashboardPage),
        h(NotesListPage),
        h(BookmarkPage),
        h(ReaderPage),
        h(RecycleBinPage),
        h(EditorPage),
        h(NoteTypeDialog),
        h(CaptureDialog),
        h(CreateMenuDialog),
        h(AppSettings),
        h(ProfileSettings, { key: profileSettings.revision, flow: profileSettings.controller, local: true }),
        h(BackupHistoryDialog),
        h(BackupImportProgress),
        h(SyncConflictDialog)
      ]);
    }
  });
  app.use(pinia);
  app.provide(Symbol.for('v-scx'), { modules: new Set() });
  app.mount(dom.window.document.querySelector('#app'));
  navigation.page = 'dashboard';
  await nextTick();
  const dashboardBookmarkGroups = dom.window.document.querySelector('#dashboardHost .dashboard-bookmark-groups');
  assert.equal(dashboardBookmarkGroups?.querySelectorAll('.dashboard-bookmark-preview-link').length, 0, 'a collapsed Vue folder does not mount descendant links');
  dashboardBookmarkGroups?.querySelector('[data-dashboard-bookmark-folder="folder-reading"]')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await nextTick();
  assert.equal(dashboardBookmarkGroups?.querySelectorAll('.dashboard-bookmark-preview-link').length, 0, 'expanding only the parent keeps a collapsed nested folder unmounted');
  dashboardBookmarkGroups?.querySelector('[data-dashboard-bookmark-folder="folder-reference"]')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await nextTick();
  assert.equal(dashboardBookmarkGroups?.querySelectorAll('.dashboard-bookmark-preview-link').length, 1, 'expanding the nested folder mounts its link');
  const originalDashboardBookmarks = vault.value.bookmarks;
  vault.mutate(value => {
    value.bookmarks = [{
      id: 'dashboard-progressive-group', kind: 'folder', title: '渐进加载分组',
      children: Array.from({ length: 120 }, (_, index) => ({
        id: `dashboard-progressive-link-${index + 1}`, kind: 'link', title: `渐进加载书签 ${index + 1}`,
        url: `https://example.com/dashboard-progressive/${index + 1}`
      }))
    }];
    value.dashboardBookmarkFolders = { 'dashboard-progressive-group': false };
  });
  await nextTick();
  dashboardBookmarkGroups?.querySelector('[data-dashboard-bookmark-folder="dashboard-progressive-group"]')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await nextTick();
  assert.equal(dashboardBookmarkGroups?.querySelectorAll('.dashboard-bookmark-preview-link').length, 48, 'an expanded dashboard group mounts only its first child batch');
  const dashboardLoadStatus = dashboardBookmarkGroups?.querySelector('.bookmark-load-more span');
  assert.equal(dashboardLoadStatus?.getAttribute('role'), 'status');
  assert.equal(dashboardLoadStatus?.getAttribute('aria-live'), 'polite');
  assert.match(dashboardLoadStatus?.textContent || '', /已显示 48 \/ 120 项/);
  dashboardBookmarkGroups?.querySelector('.bookmark-load-more button')?.click();
  await nextTick();
  assert.equal(dashboardBookmarkGroups?.querySelectorAll('.dashboard-bookmark-preview-link').length, 96, 'loading more reveals the next dashboard child batch');
  assert.match(dashboardLoadStatus?.textContent || '', /已显示 96 \/ 120 项/);
  dashboardBookmarkGroups?.querySelector('.bookmark-load-more button')?.click();
  await nextTick();
  assert.equal(dashboardBookmarkGroups?.querySelectorAll('.dashboard-bookmark-preview-link').length, 120, 'loading more reveals all dashboard children');
  assert.match(dashboardLoadStatus?.textContent || '', /已显示 120 \/ 120 项/, 'the dashboard completion status stays available');
  assert.equal(dashboardBookmarkGroups?.querySelector('.bookmark-load-more button'), null, 'the dashboard load-more action disappears when complete');
  vault.mutate(value => {
    value.bookmarks = originalDashboardBookmarks;
    value.dashboardBookmarkFolders = { 'folder-reading': true, 'folder-reference': false };
  });
  dashboardPersistCalls = 0;
  await nextTick();
  navigation.page = 'home';
  await nextTick();
  assert.equal(dom.window.document.querySelector('#searchTop .shortcut')?.textContent, '⌘ K', 'the desktop search button shows the macOS shortcut that opens global search');
  assert.equal(dom.window.document.querySelector('#qidianSidebarIsland [data-nav="all"]')?.getAttribute('aria-current'), 'page', 'the visually active notes item exposes its current-page state');
  let browserNavigation = {
    page: 'dashboard', active: 'all', typeFilter: 'all', noteQuery: '', noteId: null,
    editing: false, previewing: false, editingDraft: null, noteReturn: null
  };
  browserHistory = createBrowserHistoryController({
    window: dom.window,
    getNavigation: () => browserNavigation,
    restoreNavigation: state => { browserNavigation = { ...state, editingDraft: null }; return true; },
    restoreDialog() {},
    hasUnsavedEditorChanges: () => false,
    saveEditorBeforeLeaving() {},
    confirmLeaveEditor: async () => true,
    onInvalidRoute() {}
  });
  browserHistory.start();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(dom.window.document.querySelector('#appSettingsOverlay'), 'settings are rendered by the shared Vue root');
  const accountButton = dom.window.document.querySelector('#accountButton');
  const accountMenu = dom.window.document.querySelector('#accountMenu');
  const appSettingsOverlayElement = dom.window.document.querySelector('#appSettingsOverlay');
  const openSettingsFromAccountMenu = async () => {
    accountButton.click();
    await nextTick();
    const settingsItem = dom.window.document.querySelector('#openAppSettings');
    settingsItem.focus();
    assert.equal(dom.window.document.activeElement, settingsItem);
    settingsItem.click();
    await nextTick();
    await nextTick();
    assert.equal(appSettingsOverlayElement.classList.contains('open'), true, 'the account menu opens app settings');
    assert.equal(accountMenu.hidden, true, 'opening settings closes its parent menu');
    assert.equal(dom.window.document.activeElement, appSettingsOverlayElement.querySelector('[role="dialog"]'), 'opening settings moves focus into the dialog');
  };
  await openSettingsFromAccountMenu();
  appSettingsOverlayElement.querySelector('[data-close="appSettingsOverlay"]').click();
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.activeElement?.id, 'accountButton', 'closing settings restores focus to the persistent account control');
  await openSettingsFromAccountMenu();
  appSettingsOverlayElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.activeElement?.id, 'accountButton', 'Escape restores focus to the persistent account control');
  await openSettingsFromAccountMenu();
  appSettingsOverlayElement.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.activeElement?.id, 'accountButton', 'backdrop close restores focus to the persistent account control');
  shellCommands.length = 0;

  const helpButton = dom.window.document.querySelector('#openUsageHelpTop');
  assert.ok(helpButton, 'the persistent top bar provides a direct usage-help entry');
  assert.equal(helpButton.getAttribute('aria-label'), '使用帮助', 'the help icon has an accessible action name');
  assert.equal(dom.window.document.querySelector('#accountMenu #openUsageHelp'), null, 'the account menu does not repeat the persistent help action');
  helpButton.focus();
  helpButton.click();
  await nextTick();
  await nextTick();
  const usageHelpOverlay = dom.window.document.querySelector('#usageHelpOverlay');
  assert.equal(usageHelpOverlay?.classList.contains('open'), true, 'usage help opens from the account menu');
  assert.match(usageHelpOverlay?.textContent ?? '', /新建：填写内容后点“发布笔记”；空白内容不会进入草稿箱/, 'usage help clarifies that only non-empty notes are kept as drafts');
  assert.match(usageHelpOverlay?.textContent ?? '', /在栖点内切换页面时，如果有未保存修改，可选“保存并离开”或“取消”继续编辑/, 'usage help limits the leave confirmation to in-app navigation and matches the real actions');
  assert.equal(accountMenu.hidden, true, 'opening usage help leaves the account menu closed');
  assert.equal(dom.window.document.activeElement?.id, 'usageHelpDialog', 'opening usage help moves focus into the dialog');
  assert.match(usageHelpOverlay?.textContent ?? '', /当前页面 · 笔记列表[\s\S]*类型、最近编辑、重要收藏或草稿筛选/, 'the help explains the active dashboard');
  assert.match(usageHelpOverlay?.textContent ?? '', /笔记[\s\S]*书签[\s\S]*搜索[\s\S]*备份/, 'the help covers the four core workflows');
  assert.match(usageHelpOverlay?.textContent ?? '', /书签页添加书签和分组[\s\S]*“书签更多操作”中导入或导出浏览器书签 HTML/, 'bookmark import and export use the visible menu name rather than a screen position');
  assert.match(usageHelpOverlay?.textContent ?? '', /工具栏可设置段落、列表和表格[\s\S]*保留网页格式或 Markdown 原文[\s\S]*显示原文/, 'the note help explains editor tools, paste modes and Markdown source preview');
  assert.match(usageHelpOverlay?.textContent ?? '', /电脑、手机或其他与服务器分开的存储位置[\s\S]*“历史快照”[\s\S]*替换当前知识库[\s\S]*同盘回滚副本[\s\S]*其他设备上的备份/, 'backup help gives concrete export and history actions and explains the rollback copy limits');
  const helpSearch = usageHelpOverlay.querySelector('#usageHelpSearch');
  assert.equal(helpSearch?.getAttribute('aria-label'), '搜索使用帮助', 'the help filter has a clear accessible name');
  helpSearch.value = 'Markdown';
  helpSearch.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await nextTick();
  const visibleHelpTopics = [...usageHelpOverlay.querySelectorAll('.usage-help-section h3')].map(heading => heading.textContent);
  assert.deepEqual(visibleHelpTopics, ['写作与维护笔记'], 'search narrows help to the matching task');
  assert.match(usageHelpOverlay.textContent, /Markdown 原文/);
  helpSearch.value = '没有这项操作';
  helpSearch.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await nextTick();
  assert.match(usageHelpOverlay.querySelector('[role="status"]')?.textContent ?? '', /没有找到相关说明/);
  helpSearch.value = '';
  helpSearch.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await nextTick();
  assert.equal(usageHelpOverlay.querySelectorAll('.usage-help-section h3').length, 5, 'clearing search restores the active-page explanation and all four tasks');
  usageHelpOverlay.querySelector('[aria-label="关闭使用帮助"]').click();
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.querySelector('#usageHelpOverlay'), null, 'the close control dismisses usage help');
  assert.equal(dom.window.document.activeElement?.id, 'openUsageHelpTop', 'closing usage help restores focus to its top-bar trigger');

  const globalSearch = useGlobalSearchStore(pinia);
  const commandPalette = useCommandPaletteStore(pinia);
  accountButton.click();
  await nextTick();
  const quickActionsItem = dom.window.document.querySelector('#openQuickActions');
  quickActionsItem.focus();
  quickActionsItem.click();
  await nextTick();
  await nextTick();
  assert.equal(commandPalette.open, true, 'quick actions remain available from the account menu');
  assert.equal(accountMenu.hidden, true, 'opening quick actions closes the account menu');
  assert.doesNotMatch(dom.window.document.querySelector('.command-palette-footer')?.textContent ?? '', /Ctrl\s*K|⌘\s*K/, 'the quick actions footer does not claim the global-search shortcut');
  dom.window.document.querySelector('.command-palette').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await nextTick();
  await nextTick();
  assert.equal(commandPalette.open, false, 'Escape closes quick actions opened from the account menu');
  assert.equal(dom.window.document.activeElement?.id, 'accountButton', 'closing quick actions falls back to the visible account control');
  const mobileSearchTrigger = dom.window.document.querySelector('#mobileSearch');
  const dashboardRoute = browserNavigation;
  const bookmarksRoute = { ...dashboardRoute, page: 'bookmarks' };
  browserHistory.navigate(bookmarksRoute, 'push', dashboardRoute, 0);
  browserNavigation = bookmarksRoute;
  mobileSearchTrigger.click();
  await nextTick();
  assert.equal(globalSearch.open, true, 'search opens over the current bookmarks route');
  assert.equal(dom.window.history.state?.qidianSearchOverlay, true, 'opening global search adds a transient history entry');
  dom.window.history.back();
  await waitForCondition('Back to close global search', () => !globalSearch.open && browserNavigation.page === 'bookmarks');
  await nextTick();
  assert.equal(globalSearch.open, false, 'the first browser Back closes global search');
  assert.equal(browserNavigation.page, 'bookmarks', 'closing search does not change the underlying route');
  assert.equal(new URL(dom.window.location.href).searchParams.get('qidian'), 'bookmarks');
  dom.window.history.back();
  await waitForCondition('Back to restore the prior route', () => browserNavigation.page === 'dashboard');
  await nextTick();
  assert.equal(browserNavigation.page, 'dashboard', 'a second browser Back navigates to the previous route');
  const dashboardAfterBack = browserNavigation;
  const bookmarksAfterBack = { ...dashboardAfterBack, page: 'bookmarks' };
  browserHistory.navigate(bookmarksAfterBack, 'push', dashboardAfterBack, 0);
  browserNavigation = bookmarksAfterBack;
  const visualViewport = new dom.window.EventTarget();
  visualViewport.height = 640;
  visualViewport.offsetTop = 0;
  Object.defineProperty(dom.window, 'visualViewport', { configurable: true, value: visualViewport });
  mobileSearchTrigger.click();
  await nextTick();
  await nextTick();
  const searchLayer = dom.window.document.querySelector('.search-dismiss-layer');
  assert.equal(searchLayer.style.getPropertyValue('--search-viewport-height'), '640px', 'mobile search follows the initially visible viewport');
  visualViewport.height = 340;
  visualViewport.offsetTop = 12;
  visualViewport.dispatchEvent(new dom.window.Event('resize'));
  await nextTick();
  assert.equal(searchLayer.style.getPropertyValue('--search-viewport-height'), '340px', 'mobile search resizes when the on-screen keyboard reduces the visible area');
  assert.equal(searchLayer.style.getPropertyValue('--search-viewport-top'), '12px', 'mobile search follows visual viewport offset changes');
  dom.window.document.querySelector('.search-dismiss-layer').click();
  await nextTick();
  await waitForCondition('outside dismissal to remove the search history entry', () => dom.window.history.state?.qidianSearchOverlay === undefined);
  assert.equal(globalSearch.open, false, 'clicking outside closes global search');
  assert.equal(browserNavigation.page, 'bookmarks', 'closing by clicking outside preserves the underlying route');
  assert.equal(dom.window.history.state?.qidianSearchOverlay, undefined, 'outside close removes the transient search history entry');
  dom.window.history.back();
  await waitForCondition('Back after outside dismissal to restore the prior route', () => browserNavigation.page === 'dashboard');
  await nextTick();
  assert.equal(browserNavigation.page, 'dashboard', 'outside close leaves the previous route as the next Back target');
  mobileSearchTrigger.click();
  await nextTick();
  const closeSearchButton = dom.window.document.querySelector('.switcher-close');
  assert.equal(closeSearchButton?.textContent, '关闭', 'global search exposes a visible close action distinct from the input clear control');
  closeSearchButton.click();
  await nextTick();
  await waitForCondition('explicit close to remove the search history entry', () => dom.window.history.state?.qidianSearchOverlay === undefined);
  assert.equal(globalSearch.open, false, 'the visible close action closes global search');
  assert.equal(browserNavigation.page, 'dashboard', 'explicitly closing search preserves the underlying route');
  const disposeKeyboardEvents = mountWorkspaceKeyboardEvents(dom.window.document, {
    isEditing: () => false,
    openGlobalSearch: () => {
      commandPalette.close();
      globalSearch.show('', dom.window.document.activeElement instanceof dom.window.HTMLElement ? dom.window.document.activeElement : null);
    },
    saveDraft() {}, updateEditorBaseline() {}, closeSearch() {}, closeCapture() {}, closeCreateMenu() {}, closeBackupHistory() {},
    closeAccountSettings() {}, closeThemeMenu() {}, closeAccountMenu() {}, closeWorkspaceMenu() {}, closeSlashMenu() {}, openNote() {}
  });
  t.after(disposeKeyboardEvents);
  globalSearch.configure({
    bodyText: body => body,
    typeLabel: id => id,
    formatDate: value => String(value),
    isSafeUrl: url => /^https:\/\//.test(url)
  });
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
  await nextTick();
  await nextTick();
  assert.equal(globalSearch.open, true, 'Ctrl+K opens global search as required');
  assert.equal(commandPalette.open, false, 'Ctrl+K does not open quick actions');
  assert.equal(dom.window.document.activeElement?.id, 'globalSearch', 'Ctrl+K moves focus into global search');
  dom.window.document.querySelector('#globalSearch').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await nextTick();
  await waitForCondition('Escape to close global search opened by Ctrl+K', () => !globalSearch.open);

  accountButton.click();
  await nextTick();
  dom.window.document.querySelector('#openQuickActions').focus();
  dom.window.document.querySelector('#openQuickActions').click();
  await nextTick();
  await nextTick();
  dom.window.document.querySelector('.command-palette').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
  await nextTick();
  await nextTick();
  assert.equal(commandPalette.open, false, 'Ctrl+K from quick actions closes that panel');
  assert.equal(globalSearch.open, true, 'Ctrl+K from quick actions transitions to global search');
  assert.equal(dom.window.document.activeElement?.id, 'globalSearch', 'the transition places focus in the search field');
  dom.window.document.querySelector('#globalSearch').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await nextTick();
  await waitForCondition('Escape to close search opened from quick actions', () => !globalSearch.open);

  dom.window.document.querySelector('#searchTop').click();
  await nextTick();
  assert.equal(globalSearch.open, true, 'desktop search opens directly from the Vue search trigger');
  dom.window.document.querySelector('#globalSearch').dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    key: 'Escape', bubbles: true, cancelable: true
  }));
  await nextTick();
  await nextTick();
  await waitForCondition('Escape to remove the transient search history entry', () => dom.window.history.state?.qidianSearchOverlay === undefined);
  assert.equal(dom.window.history.state?.qidianSearchOverlay, undefined, 'Escape removes the transient search history entry');
  mobileSearchTrigger.focus();
  assert.equal(dom.window.document.activeElement, mobileSearchTrigger, 'the search trigger can receive focus before opening the dialog');
  mobileSearchTrigger.click();
  assert.equal(dom.window.document.activeElement, mobileSearchTrigger, 'opening the dialog does not blur its trigger before focus capture');
  await nextTick();
  await nextTick();
  assert.equal(globalSearch.open, true, 'mobile search opens directly from the Vue navigation');
  const searchDialog = dom.window.document.querySelector('#switcher');
  assert.ok(searchDialog, 'Vue renders the search dialog when the store opens');
  assert.equal(searchDialog.getAttribute('aria-modal'), 'true', 'search exposes modal semantics to assistive technology');
  const searchResultsGroup = searchDialog.querySelector('#switcherList');
  assert.equal(searchResultsGroup?.getAttribute('role'), 'group', 'search results use a container role compatible with interactive note and bookmark controls');
  assert.equal(searchResultsGroup?.getAttribute('aria-label'), '搜索结果', 'the search result group has a clear accessible name');
  const searchInput = dom.window.document.querySelector('#globalSearch');
  assert.equal(dom.window.document.activeElement, searchInput, 'opening the dialog moves focus to search input');
  const populatedSearchVault = structuredClone(vault.value);
  vault.replace({ ...populatedSearchVault, notes: [], bookmarks: [] });
  await nextTick();
  let searchEmptyState = searchDialog.querySelector('.empty');
  assert.equal(searchEmptyState?.textContent.trim(), '还没有可搜索的内容。添加笔记或书签后，即可在这里搜索。', 'an empty vault gets a useful empty-state prompt before searching');
  assert.equal(searchEmptyState?.getAttribute('role'), 'status', 'the empty-vault prompt is announced as a search status');
  assert.equal(searchEmptyState?.getAttribute('aria-live'), 'polite');
  assert.equal(searchEmptyState?.parentElement?.getAttribute('role'), 'group', 'the empty-state status is contained by a named group rather than an invalid list');
  globalSearch.setQuery('missing');
  await nextTick();
  searchEmptyState = searchDialog.querySelector('.empty');
  assert.equal(searchEmptyState?.textContent.trim(), '没有找到匹配的内容', 'a query against an empty vault gets the no-match state');
  assert.equal(searchEmptyState?.getAttribute('role'), 'status', 'no matching content is announced as a search status');
  assert.equal(searchEmptyState?.getAttribute('aria-live'), 'polite');
  vault.replace(populatedSearchVault);
  await nextTick();
  globalSearch.setQuery('no matching record');
  await nextTick();
  searchEmptyState = searchDialog.querySelector('.empty');
  assert.equal(searchEmptyState?.textContent.trim(), '没有找到匹配的内容', 'a query with no results explains the empty result');
  assert.equal(searchEmptyState?.getAttribute('role'), 'status', 'a no-match query is announced as a search status');
  const tab = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  searchInput.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, false, 'Tab can move from the search input to the visible close action');
  const searchCloseButton = searchDialog.querySelector('.switcher-close');
  searchCloseButton.focus();
  const lastTabWithoutResults = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  searchCloseButton.dispatchEvent(lastTabWithoutResults);
  assert.equal(lastTabWithoutResults.defaultPrevented, true, 'Tab from the final close action wraps to the search input when there are no results');
  assert.equal(dom.window.document.activeElement, searchInput);
  const firstReverseTabWithoutResults = new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  searchInput.dispatchEvent(firstReverseTabWithoutResults);
  assert.equal(firstReverseTabWithoutResults.defaultPrevented, true, 'Shift+Tab from the search input wraps to the close action when there are no results');
  assert.equal(dom.window.document.activeElement, searchCloseButton);
  globalSearch.setQuery('');
  await nextTick();
  assert.equal(searchDialog.querySelector('.empty'), null, 'matching results replace the empty-query prompt');
  const searchResults = [...searchDialog.querySelectorAll('.switcher-item')];
  assert.equal(searchResults.length, 2, 'the fixture exposes one note and one bookmark result');
  assert.ok(searchResults.every(result => result.parentElement === searchResultsGroup), 'interactive results remain grouped without being misrepresented as list items');
  searchResults.at(-1).focus();
  const lastTab = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  searchResults.at(-1).dispatchEvent(lastTab);
  assert.equal(lastTab.defaultPrevented, true, 'Tab from the final search result wraps to the search input');
  assert.equal(dom.window.document.activeElement, searchInput);
  const firstReverseTab = new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  searchInput.dispatchEvent(firstReverseTab);
  assert.equal(firstReverseTab.defaultPrevented, true, 'Shift+Tab from the search input wraps to the final result');
  assert.equal(dom.window.document.activeElement, searchResults.at(-1));
  const originalSearchBookmarks = vault.value.bookmarks;
  const overflowSearchBookmarks = (count) => Array.from({ length: count }, (_, index) => ({
    id: `search-overflow-${index + 1}`,
    kind: 'link',
    title: 'overflow-keyword matching bookmark',
    url: `https://example.com/overflow/${index + 1}`
  }));
  vault.mutate(value => { value.bookmarks = overflowSearchBookmarks(13); });
  globalSearch.setQuery('overflow-keyword');
  await nextTick();
  assert.equal(searchDialog.querySelectorAll('[data-search-bookmark]').length, 12, 'global search keeps its established twelve-bookmark cap');
  assert.match(searchDialog.querySelector('[role="status"]')?.textContent || '', /仅显示部分匹配结果/, 'the dialog explains that additional matches were omitted');
  vault.mutate(value => { value.bookmarks = overflowSearchBookmarks(12); });
  await nextTick();
  assert.equal(searchDialog.querySelector('[role="status"]'), null, 'exactly twelve matches do not show an unnecessary truncation hint');
  vault.mutate(value => { value.bookmarks = originalSearchBookmarks; });
  globalSearch.setQuery('');
  await nextTick();
  searchInput.focus();
  searchInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
  await nextTick();
  await nextTick();
  assert.equal(globalSearch.open, false, 'the search keyboard shortcut closes the dialog');
  assert.equal(commandPalette.open, false, 'closing the search dialog does not bubble the shortcut and open a second dialog');
  assert.equal(dom.window.document.activeElement, mobileSearchTrigger, 'closing from the keyboard restores focus to the opener');
  await waitForCondition('keyboard close to remove the transient search history entry', () => dom.window.history.state?.qidianSearchOverlay === undefined);
  assert.equal(dom.window.history.state?.qidianSearchOverlay, undefined, 'keyboard close removes the transient search history entry');

  mobileSearchTrigger.click();
  await nextTick();
  await nextTick();
  const rapidlyClosedSearch = dom.window.document.querySelector('#globalSearch');
  rapidlyClosedSearch.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await nextTick();
  await nextTick();
  mobileSearchTrigger.click();
  await nextTick();
  await nextTick();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(globalSearch.open, true, 'a pending Back from the previous search must not close a newly opened search');
  assert.equal(dom.window.history.state?.qidianSearchOverlay, true, 'the reopened search owns a fresh transient history entry');
  globalSearch.close();
  dom.window.history.back();
  await new Promise(resolve => setTimeout(resolve, 20));
  await nextTick();

  accountButton.click();
  await nextTick();
  const quickActionsOpener = dom.window.document.querySelector('#openQuickActions');
  quickActionsOpener.focus();
  quickActionsOpener.click();
  await nextTick();
  await nextTick();
  const commandPaletteInput = dom.window.document.querySelector('#commandPaletteInput');
  assert.equal(dom.window.document.activeElement, commandPaletteInput, 'opening quick actions focuses its search input');
  commandPaletteInput.value = '搜索笔记和书签';
  commandPaletteInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await nextTick();
  commandPaletteInput.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await nextTick();
  await nextTick();
  assert.equal(globalSearch.open, true, 'the search command opens global search from quick actions');
  const searchOpenedFromPalette = dom.window.document.querySelector('#globalSearch');
  searchOpenedFromPalette.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.activeElement, accountButton, 'closing search restores focus to the persistent account control that opened quick actions');
  const removedSearchTrigger = dom.window.document.createElement('button');
  removedSearchTrigger.textContent = '临时笔记搜索入口';
  dom.window.document.body.append(removedSearchTrigger);
  removedSearchTrigger.focus();
  globalSearch.show('', removedSearchTrigger);
  await nextTick();
  await nextTick();
  const searchFromRemovedNote = dom.window.document.querySelector('#globalSearch');
  assert.equal(dom.window.document.activeElement, searchFromRemovedNote, 'opening search focuses its input before the source note is removed');
  removedSearchTrigger.remove();
  searchFromRemovedNote.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await nextTick();
  await nextTick();
  assert.ok(['searchTop', 'mobileSearch', 'menuBtn', 'accountButton'].includes(dom.window.document.activeElement?.id), 'closing search falls back to a visible workspace control when cloud sync removed its opener');
  globalSearch.show();
  await nextTick();
  dom.window.document.querySelector('.search-dismiss-layer').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await nextTick();
  assert.equal(globalSearch.open, false, 'clicking outside the search dialog closes it through its component backdrop');
  dom.window.document.querySelector('#newSide').click();
  assert.equal(commands.at(-1)?.type, 'open-create-menu', 'the sidebar create action uses the typed navigation command');
  dom.window.document.querySelector('#brandHome').click();
  assert.deepEqual(commands.at(-1), { type: 'dashboard' }, 'the sidebar brand returns home through the typed Vue navigation command');
  commands.splice(0, commands.length);
  appSettings.setIndicators({ hasConflict: true, hasIgnoredDraft: true });
  appSettings.show();
  await nextTick();
  await nextTick();
  const settingsOverlay = dom.window.document.querySelector('#appSettingsOverlay');
  assert.equal(settingsOverlay.classList.contains('open'), true);
  assert.equal(dom.window.document.querySelector('#reloadCloud use')?.getAttribute('href'), '#i-download', 'reload uses the existing download icon');
  assert.equal(dom.window.document.querySelector('#reviewSyncConflict use')?.getAttribute('href'), '#i-table', 'conflict review uses the comparison icon');
  assert.equal(dom.window.document.querySelector('#backupHistory use')?.getAttribute('href'), '#i-folder', 'backup history uses the archive icon');
  assert.equal(dom.window.document.querySelector('#reviewSyncConflict').hidden, false);
  assert.equal(dom.window.document.querySelector('#restoreLocalDraft').hidden, false);
  dom.window.document.querySelector('#exportBtn').click();
  assert.deepEqual(appSettingsCommands, ['export-backup']);
  appSettings.close();
  await nextTick();
  assert.equal(settingsOverlay.classList.contains('open'), false);

  navigation.page = 'bookmarks';
  await nextTick();
  const bookmarkSearch = dom.window.document.querySelector('#dashboardHost .bookmark-page input[type="search"]');
  assert.ok(bookmarkSearch, 'the bookmark feature page is mounted by Vue');
  bookmarkSearch.value = 'MDN';
  bookmarkSearch.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await nextTick();
  assert.equal(dom.window.document.querySelectorAll('#dashboardHost .bookmark-card').length, 1);
  assert.equal(bookmarks.snapshot.query, 'mdn');
  assert.deepEqual(bookmarkCommands, [], 'view-only actions are handled in Pinia without calling the legacy action adapter');
  const originalBookmarks = vault.value.bookmarks;
  bookmarkSearch.value = '';
  bookmarkSearch.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await nextTick();
  vault.mutate(value => {
    value.bookmarks = Array.from({ length: 120 }, (_, index) => ({
      id: `progressive-bookmark-${index + 1}`,
      kind: 'link',
      title: `渐进显示书签 ${index + 1}`,
      url: `https://example.com/progressive/${index + 1}`
    }));
  });
  await nextTick();
  assert.equal(dom.window.document.querySelectorAll('#dashboardHost .bookmark-card').length, 48, 'the Vue bookmark page initially mounts only one batch from a long section');
  const bookmarkLoadStatus = dom.window.document.querySelector('#dashboardHost .bookmark-load-more span');
  assert.equal(bookmarkLoadStatus?.getAttribute('role'), 'status', 'the loaded bookmark count is exposed as a status update');
  assert.equal(bookmarkLoadStatus?.getAttribute('aria-live'), 'polite', 'screen readers announce count changes without interrupting');
  assert.match(bookmarkLoadStatus?.textContent || '', /已显示 48 \/ 120 个/);
  dom.window.document.querySelector('#dashboardHost .bookmark-load-more button')?.click();
  await nextTick();
  assert.equal(dom.window.document.querySelectorAll('#dashboardHost .bookmark-card').length, 96, 'loading more reveals the next batch');
  assert.match(bookmarkLoadStatus?.textContent || '', /已显示 96 \/ 120 个/, 'the live status reports each batch');
  dom.window.document.querySelector('#dashboardHost .bookmark-load-more button')?.click();
  await nextTick();
  assert.equal(dom.window.document.querySelectorAll('#dashboardHost .bookmark-card').length, 120, 'loading more mounts the remaining bookmarks');
  assert.match(bookmarkLoadStatus?.textContent || '', /已显示 120 \/ 120 个/, 'the completion status remains available after the button disappears');
  assert.equal(dom.window.document.querySelector('#dashboardHost .bookmark-load-more button'), null, 'the load-more action disappears when the section is complete');
  const progressiveSearchInput = dom.window.document.querySelector('#dashboardHost .bookmark-page input[aria-label="搜索书签"]');
  progressiveSearchInput.value = '渐进显示书签 120';
  progressiveSearchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await nextTick();
  assert.equal(dom.window.document.querySelectorAll('#dashboardHost .bookmark-card').length, 1, 'bookmark search still finds records beyond the rendered batch');
  assert.match(dom.window.document.querySelector('#dashboardHost .bookmark-card')?.textContent || '', /渐进显示书签 120/);
  progressiveSearchInput.value = '';
  progressiveSearchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await nextTick();
  assert.equal(dom.window.document.querySelectorAll('#dashboardHost .bookmark-card').length, 48, 'changing the search resets progressive rendering to its initial batch');
  vault.mutate(value => { value.bookmarks = originalBookmarks; });
  bookmarkCommands.length = 0;
  await nextTick();
  bookmarkSearch.value = 'MDN';
  bookmarkSearch.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await nextTick();
  const bookmarkMenu = dom.window.document.querySelector('#dashboardHost .bookmark-tools');
  const desktopOrganize = dom.window.document.querySelector('#dashboardHost .bookmark-desktop-action[aria-pressed]');
  const mobileOrganize = dom.window.document.querySelector('#dashboardHost .bookmark-mobile-action[aria-pressed]');
  assert.ok(desktopOrganize, 'desktop keeps its direct organize action');
  assert.ok(mobileOrganize, 'mobile receives the same action in the more menu');
  bookmarkMenu.open = true;
  mobileOrganize.click();
  await nextTick();
  assert.equal(bookmarks.snapshot.organizing, true, 'the mobile menu action enters organize mode');
  assert.equal(bookmarkMenu.open, false, 'using a mobile menu action dismisses the menu');
  desktopOrganize.click();
  await nextTick();
  assert.equal(bookmarks.snapshot.organizing, false, 'the direct desktop action remains connected');
  bookmarkMenu.open = true;
  mobileOrganize.click();
  await nextTick();
  assert.equal(bookmarks.snapshot.organizing, true);
  assert.equal(bookmarkMenu.open, false);
  dom.window.document.querySelector('#dashboardHost [aria-label="选择MDN"]').click();
  await nextTick();
  assert.equal(bookmarks.snapshot.selection.count, 1);
  assert.deepEqual(bookmarkCommands, [], 'organizing and selection remain feature-local UI state');
  dom.window.document.querySelector('#dashboardHost [data-bm-folder="folder-reading"]').click();
  await nextTick();
  assert.equal(bookmarks.snapshot.selectedFolder, 'folder-reading');
  assert.equal(bookmarks.snapshot.query, '');
  assert.deepEqual(bookmarkCommands, [], 'folder selection does not dispatch through the legacy DOM view');
  bookmarkMenu.open = true;
  [...dom.window.document.querySelectorAll('#dashboardHost .bookmark-mobile-action')].find(button => button.textContent.trim() === '添加书签').click();
  await nextTick();
  assert.equal(bookmarkMenu.open, false, 'the mobile add action dismisses its menu');
  assert.equal(bookmarks.editor.parentId, 'folder-reading');
  assert.deepEqual(bookmarkCommands, [{ type: 'add-link', parentId: 'folder-reading' }]);
  bookmarks.closeEditor();
  await nextTick();
  bookmarkCommands.length = 0;
  const addBookmarkButton = dom.window.document.querySelector('#dashboardHost .bookmark-desktop-action.primary-btn');
  addBookmarkButton.focus();
  addBookmarkButton.click();
  await nextTick();
  await nextTick();
  const bookmarkDialog = dom.window.document.querySelector('#bookmarkEditOverlay');
  assert.ok(bookmarkDialog, 'adding a bookmark opens its feature dialog');
  assert.equal(dom.window.document.activeElement, bookmarkDialog.querySelector('#bookmarkEditName'), 'opening the editor focuses its first field');
  assert.equal(bookmarkDialog.querySelector('#bookmarkEditParent').value, 'folder-reading');
  bookmarks.editor.saving = true;
  bookmarkDialog.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.ok(bookmarks.editor, 'Escape cannot close the editor while its save is pending');
  await nextTick();
  assert.equal(bookmarkDialog.querySelector('.round-btn').disabled, true);
  bookmarkDialog.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
  assert.ok(bookmarks.editor, 'clicking the backdrop cannot close the editor while its save is pending');
  bookmarks.editor.saving = false;
  bookmarkDialog.querySelector('#bookmarkEditName').value = '说明文档';
  bookmarkDialog.querySelector('#bookmarkEditName').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  bookmarkDialog.querySelector('#bookmarkEditUrl').value = 'https://docs.example.test';
  bookmarkDialog.querySelector('#bookmarkEditUrl').dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  bookmarkDialog.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await nextTick();
  assert.deepEqual(JSON.parse(JSON.stringify(bookmarkCommands.filter(action => action.type !== 'toggle-directory'))), [
    { type: 'add-link', parentId: 'folder-reading' },
    { type: 'set-editor-title', value: '说明文档' },
    { type: 'set-editor-url', value: 'https://docs.example.test' },
    { type: 'save-editor' }
  ]);
  assert.equal(bookmarks.editor.title, '说明文档');
  bookmarks.closeEditor();
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.activeElement, addBookmarkButton, 'closing the editor restores focus to its visible opener');

  const mobileNewButton = dom.window.document.querySelector('#mobileNew');
  const bookmarkSearchField = dom.window.document.querySelector('#dashboardHost input[aria-label="搜索书签"]');
  const mobileFocusCalls = [];
  mobileNewButton.getBoundingClientRect = () => ({ width: 48, height: 48 });
  bookmarkSearchField.getBoundingClientRect = () => ({ width: 280, height: 40 });
  const nativeMobileNewFocus = mobileNewButton.focus.bind(mobileNewButton);
  mobileNewButton.focus = options => { mobileFocusCalls.push(options); nativeMobileNewFocus(options); };
  const removedMobileMenuChoice = dom.window.document.createElement('button');
  removedMobileMenuChoice.textContent = '书签';
  dom.window.document.body.append(removedMobileMenuChoice);
  removedMobileMenuChoice.focus();
  bookmarks.openEditor({ kind: 'link', id: '', parentId: '', title: '', url: '' });
  removedMobileMenuChoice.remove();
  await nextTick();
  await nextTick();
  assert.ok(dom.window.document.querySelector('#bookmarkEditOverlay'), 'opening a bookmark editor after its menu trigger is removed keeps the dialog available');
  dom.window.document.querySelector('#bookmarkEditOverlay .secondary-btn').click();
  await nextTick();
  await nextTick();
  assert.equal(bookmarks.editor, null, 'the bookmark editor is closed before its fallback focus is checked');
  assert.equal(dom.window.document.querySelector('#bookmarkEditOverlay'), null, 'the closed bookmark dialog is removed before focus returns');
  assert.deepEqual(mobileFocusCalls, [{ preventScroll: true }], 'closing a bookmark editor whose menu trigger was removed targets the visible mobile New button');

  mobileNewButton.getBoundingClientRect = () => ({ width: 0, height: 0 });
  const bookmarkSearchFocusCalls = [];
  const nativeBookmarkSearchFocus = bookmarkSearchField.focus.bind(bookmarkSearchField);
  bookmarkSearchField.focus = options => { bookmarkSearchFocusCalls.push(options); nativeBookmarkSearchFocus(options); };
  const removedDesktopMenuChoice = dom.window.document.createElement('button');
  removedDesktopMenuChoice.textContent = '书签';
  dom.window.document.body.append(removedDesktopMenuChoice);
  removedDesktopMenuChoice.focus();
  bookmarks.openEditor({ kind: 'link', id: '', parentId: '', title: '', url: '' });
  removedDesktopMenuChoice.remove();
  await nextTick();
  await nextTick();
  bookmarks.closeEditor();
  await nextTick();
  await nextTick();
  assert.deepEqual(bookmarkSearchFocusCalls, [{ preventScroll: true }], 'focus returns to bookmark search when the mobile New button has no visible layout box');

  bookmarkCommands.length = 0;
  const bookmarkCard = dom.window.document.querySelector('#dashboardHost .bookmark-card');
  bookmarkCard.querySelector('.item-menu summary').click();
  const deleteBookmarkButton = bookmarkCard.querySelector('.item-menu-panel .danger-btn');
  deleteBookmarkButton.focus();
  deleteBookmarkButton.click();
  await nextTick();
  await nextTick();
  const deleteDialog = dom.window.document.querySelector('#bookmarkDeleteOverlay');
  assert.ok(deleteDialog, 'deleting a bookmark opens the in-page confirmation dialog');
  assert.equal(bookmarkCard.querySelector('.item-menu').open, false, 'opening delete confirmation closes its background action menu');
  assert.equal(deleteDialog.getAttribute('role'), null, 'the dialog container is not mistaken for the alertdialog');
  const alertDialog = deleteDialog.querySelector('[role="alertdialog"]');
  assert.equal(alertDialog.querySelector('#bookmarkDeleteTitle').textContent, '删除书签');
  const cancelDeleteButton = alertDialog.querySelector('.secondary-btn');
  const closeDeleteButton = alertDialog.querySelector('.round-btn');
  const confirmDeleteButton = alertDialog.querySelector('.danger-btn');
  assert.equal(dom.window.document.activeElement, cancelDeleteButton, 'opening delete confirmation focuses the safer cancel action');
  confirmDeleteButton.focus();
  const tabFromLast = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  confirmDeleteButton.dispatchEvent(tabFromLast);
  assert.equal(tabFromLast.defaultPrevented, true, 'Tab from the last action stays inside the confirmation');
  assert.equal(dom.window.document.activeElement, closeDeleteButton);
  const shiftTabFromFirst = new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  closeDeleteButton.dispatchEvent(shiftTabFromFirst);
  assert.equal(shiftTabFromFirst.defaultPrevented, true, 'Shift+Tab from the first action stays inside the confirmation');
  assert.equal(dom.window.document.activeElement, confirmDeleteButton);
  deleteDialog.querySelector('.danger-btn').click();
  await nextTick();
  assert.deepEqual(bookmarkCommands, [
    { type: 'delete', id: 'bookmark-mdn' },
    { type: 'confirm-delete' }
  ]);
  bookmarks.closeDeleteDialog();
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.activeElement, dom.window.document.querySelector('#dashboardHost input[aria-label="搜索书签"]'), 'closing delete confirmation restores focus to the visible search field when the menu opener is collapsed');
  bookmarkCommands.length = 0;
  dom.window.document.querySelector('#dashboardHost [aria-label="选择MDN"]').click();
  await nextTick();
  const bulkDeleteButton = dom.window.document.querySelector('#dashboardHost .bookmark-selection-bar .danger-btn');
  assert.ok(bulkDeleteButton && !bulkDeleteButton.disabled);
  bulkDeleteButton.focus();
  bulkDeleteButton.click();
  await nextTick();
  await nextTick();
  const bulkDialog = dom.window.document.querySelector('#bookmarkBulkOverlay');
  assert.ok(bulkDialog, 'bulk deletion opens the feature confirmation dialog');
  assert.match(bulkDialog.querySelector('#bookmarkBulkMessage').textContent, /1 个网址移入回收站/);
  const bulkAlertDialog = bulkDialog.querySelector('[role="dialog"]');
  const bulkCloseButton = bulkDialog.querySelector('.round-btn');
  const bulkCancelButton = bulkDialog.querySelector('.secondary-btn');
  const bulkConfirmButton = bulkDialog.querySelector('.danger-btn');
  assert.equal(dom.window.document.activeElement, bulkCancelButton, 'bulk deletion focuses the safer cancel action');
  bulkConfirmButton.focus();
  const bulkTabFromLast = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  bulkConfirmButton.dispatchEvent(bulkTabFromLast);
  assert.equal(bulkTabFromLast.defaultPrevented, true, 'Tab from the last bulk action stays inside the confirmation');
  assert.equal(dom.window.document.activeElement, bulkCloseButton);
  const bulkShiftTabFromFirst = new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  bulkCloseButton.dispatchEvent(bulkShiftTabFromFirst);
  assert.equal(bulkShiftTabFromFirst.defaultPrevented, true, 'Shift+Tab from the first bulk action stays inside the confirmation');
  assert.equal(dom.window.document.activeElement, bulkConfirmButton);
  bulkDialog.querySelector('.danger-btn').click();
  await nextTick();
  assert.deepEqual(bookmarkCommands, [
    { type: 'bulk-delete' },
    { type: 'confirm-bulk' }
  ]);
  bookmarks.closeBulkDialog();
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.activeElement, bulkDeleteButton, 'closing the bulk dialog restores focus to its visible opener');
  bookmarks.openBulkDialog('move', ['bookmark-mdn']);
  await nextTick();
  await nextTick();
  const bulkMoveDialog = dom.window.document.querySelector('#bookmarkBulkOverlay');
  const bulkTargetSelect = bulkMoveDialog.querySelector('#bookmarkBulkTarget');
  const bulkMoveCloseButton = bulkMoveDialog.querySelector('.round-btn');
  const bulkMoveConfirmButton = bulkMoveDialog.querySelector('.primary-btn');
  assert.equal(dom.window.document.activeElement, bulkTargetSelect, 'bulk move focuses its target group selector');
  bulkMoveConfirmButton.focus();
  assert.equal(dom.window.document.activeElement, bulkMoveConfirmButton, 'the bulk move confirmation button can receive focus');
  const bulkMoveTabFromLast = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  bulkMoveConfirmButton.dispatchEvent(bulkMoveTabFromLast);
  assert.equal(bulkMoveTabFromLast.defaultPrevented, true, 'Tab from the last move action stays inside the dialog');
  assert.equal(dom.window.document.activeElement, bulkMoveCloseButton);
  const bulkMoveShiftTabFromFirst = new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  bulkMoveCloseButton.dispatchEvent(bulkMoveShiftTabFromFirst);
  assert.equal(bulkMoveShiftTabFromFirst.defaultPrevented, true, 'Shift+Tab from the first move action stays inside the dialog');
  assert.equal(dom.window.document.activeElement, bulkMoveConfirmButton);
  bulkMoveCloseButton.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.querySelector('#bookmarkBulkOverlay'), null, 'Escape closes the bulk move dialog');
  assert.equal(dom.window.document.activeElement, bulkDeleteButton, 'closing bulk move restores focus to its visible opener');
  bookmarkCommands.length = 0;

  let pickerClicks = 0;
  const bookmarkFileInput = dom.window.document.querySelector('#dashboardHost .bookmark-page input[type="file"]');
  assert.ok(bookmarkFileInput.classList.contains('visually-hidden'), 'the native browser picker stays visually hidden');
  assert.equal(bookmarkFileInput.getAttribute('accept'), '.html,.htm,text/html', 'bookmark import accepts browser-exported HTML only');
  const styles = await readFile(new URL('../../../src/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.visually-hidden\{position:absolute!important;width:1px!important;height:1px!important/);
  bookmarkFileInput.click = () => { pickerClicks++; };
  dom.window.document.querySelector('#dashboardHost .bookmark-tools summary').click();
  bookmarkCommands.length = 0;
  const importBookmarkButton = [...dom.window.document.querySelectorAll('#dashboardHost .bookmark-tools button')].find(button => button.textContent.includes('导入书签'));
  importBookmarkButton.focus();
  importBookmarkButton.click();
  await nextTick();
  assert.equal(pickerClicks, 1, 'the import action opens the Vue-owned file picker');
  assert.deepEqual(bookmarkCommands, [{ type: 'import' }]);
  bookmarkCommands.length = 0;
  importBookmarkButton.closest('details').setAttribute('inert', '');
  bookmarks.openImportDialog({ items: [], folders: [{ id: 'folder-preview', path: '资料 / 手册' }], added: 2, duplicates: 1, skipped: 0 });
  await nextTick();
  await nextTick();
  const importDialog = dom.window.document.querySelector('#bookmarkImportOverlay');
  assert.ok(importDialog, 'the parsed bookmark file is presented in a Vue import preview');
  assert.match(importDialog.querySelector('#bookmarkImportMessage').textContent, /新增 2 个书签 · 跳过 1 个重复项/);
  assert.equal(importDialog.querySelector('[aria-label="导入分组预览"]').textContent.trim(), '资料 / 手册');
  const importAlertDialog = importDialog.querySelector('[role="dialog"]');
  assert.equal(importAlertDialog.getAttribute('aria-modal'), 'true', 'bookmark import preview is exposed as a modal dialog');
  const importCloseButton = importDialog.querySelector('.round-btn');
  const importCancelButton = importDialog.querySelector('.secondary-btn');
  const importConfirmButton = importDialog.querySelector('.primary-btn');
  assert.equal(dom.window.document.activeElement, importCancelButton, 'bookmark import focuses the safer cancel action');
  importConfirmButton.focus();
  const importTabFromLast = new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  importConfirmButton.dispatchEvent(importTabFromLast);
  assert.equal(importTabFromLast.defaultPrevented, true, 'Tab from the final import action stays inside the preview');
  assert.equal(dom.window.document.activeElement, importCloseButton);
  const importShiftTabFromFirst = new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
  importCloseButton.dispatchEvent(importShiftTabFromFirst);
  assert.equal(importShiftTabFromFirst.defaultPrevented, true, 'Shift+Tab from the first import action stays inside the preview');
  assert.equal(dom.window.document.activeElement, importConfirmButton);
  importDialog.querySelector('.primary-btn').click();
  await nextTick();
  assert.deepEqual(bookmarkCommands, [{ type: 'confirm-import' }]);
  importConfirmButton.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.querySelector('#bookmarkImportOverlay'), null, 'Escape cancels and closes the bookmark import preview');
  assert.equal(dom.window.document.activeElement, dom.window.document.querySelector('#dashboardHost input[aria-label="搜索书签"]'), 'closing import preview falls back to the visible bookmark search when its menu opener is hidden');
  importBookmarkButton.closest('details').removeAttribute('inert');
  bookmarkCommands.length = 0;
  dom.window.document.querySelector('#dashboardHost .bookmark-tools').open = false;
  navigation.page = 'home';
  await nextTick();

  accountButton.click();
  await nextTick();
  const profileSettingsItem = dom.window.document.querySelector('#openProfileSettings');
  profileSettingsItem.focus();
  profileSettingsItem.click();
  await nextTick();
  await nextTick();
  assert.equal(accountMenu.hidden, true, 'opening profile settings closes its account menu');
  const profileOverlay = dom.window.document.querySelector('#profileSettingsOverlay');
  assert.equal(profileOverlay.classList.contains('open'), true);
  assert.equal(dom.window.document.activeElement, profileOverlay.querySelector('[role="dialog"]'));
  assert.equal(dom.window.document.querySelector('#profileSettingsMessage').textContent, '当前是本地界面预览；请登录部署后的栖点管理头像和密码。');
  profileSettings.close();
  await nextTick();
  await nextTick();
  assert.equal(profileOverlay.classList.contains('open'), false);
  assert.equal(dom.window.document.activeElement?.id, 'accountButton', 'closing profile settings restores focus when its menu opener was hidden');

  profileSettings.configure({
    local: false,
    username: 'two-factor-test',
    getAccountProfile: async () => ({ id: 'account-totp', username: 'two-factor-test', created: 1, avatarMime: null, totpEnabled: false }),
    getAccountAvatar: async () => new Blob(),
    saveAccountAvatar: async () => undefined,
    removeAccountAvatar: async () => undefined,
    changeAccountPassword: async () => undefined,
    beginTotpEnrollment: async currentPassword => {
      assert.equal(currentPassword, 'current-password');
      return { pendingId: 'pending-totp', secret: 'TESTSECRET', uri: 'otpauth://totp/test' };
    },
    confirmTotpEnrollment: async () => ({ enabled: true, recoveryCodes: ['TEST-RECOVERY-CODE'] }),
    disableTotp: async () => undefined,
    createExtensionPairingCode: async name => ({ code: 'pair-once', name, expires: Date.now() + 60_000 }),
    listExtensionTokens: async () => ({ tokens: [] }),
    revokeExtensionToken: async () => undefined
  });
  await nextTick();
  await profileSettings.show();
  await nextTick();
  const totpPassword = dom.window.document.querySelector('#totpPassword');
  totpPassword.value = 'current-password';
  totpPassword.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const beginTotp = dom.window.document.querySelector('#totpEnrollmentStartForm');
  beginTotp.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  await nextTick();
  await nextTick();
  assert.equal(profileSettings.controller.state.visible, true, 'the profile dialog stays open during enrollment');
  assert.ok(profileSettings.controller.state.totpEnrollment, 'the pending authenticator enrollment is displayed');
  assert.equal(dom.window.document.activeElement?.id, 'totpEnrollmentCode', 'starting enrollment moves keyboard focus to the newly displayed verification code');
  const totpCode = dom.window.document.querySelector('#totpEnrollmentCode');
  totpCode.value = '123456';
  totpCode.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  dom.window.document.querySelector('#totpEnrollmentConfirmForm').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setTimeout(resolve, 0));
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.activeElement?.id, 'dismissTotpRecoveryCodes', 'confirming enrollment focuses the one-time recovery-code acknowledgement action');
  dom.window.document.querySelector('#dismissTotpRecoveryCodes').click();
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.activeElement?.id, 'totpStatus', 'dismissing one-time recovery codes moves focus to the enabled status instead of losing it');
  profileSettings.close();
  await nextTick();

  shellCommands.length = 0;
  assert.ok(dom.window.document.querySelector('#backupHistoryOverlay'), 'backup history is rendered by the shared Vue root');
  let resolveBackupLoad;
  listBackupSummaries = () => new Promise(resolve => { resolveBackupLoad = resolve; });
  backupHistory.show();
  const backupLoad = backupHistory.refresh();
  await nextTick();
  const backupHistoryList = dom.window.document.querySelector('#backupHistoryList');
  assert.equal(backupHistoryList.getAttribute('role'), null, 'the loading message is not presented as a list item');
  assert.match(backupHistoryList.textContent, /正在读取 Docker 服务端快照/);
  resolveBackupLoad([{ revision: 2, created: 1 }]);
  await backupLoad;
  await nextTick();
  assert.equal(backupHistoryList.getAttribute('role'), 'list', 'loaded snapshots expose list semantics');
  assert.equal(dom.window.document.querySelector('#backupHistoryOverlay').classList.contains('open'), true);
  assert.equal(dom.window.document.querySelectorAll('#backupHistoryList .backup-row').length, 1);
  assert.equal(dom.window.document.querySelector('#backupHistoryList .backup-row').getAttribute('role'), 'listitem');
  assert.match(dom.window.document.querySelector('#backupHistoryOverlay').textContent, /同一 SQLite 数据库/);
  dom.window.document.querySelector('[data-backup-download="2"]').click();
  dom.window.document.querySelector('[data-backup-restore="2"]').click();
  await nextTick();
  assert.deepEqual(backupActions, [['download', 2], ['restore', 2]], 'backup controls call their configured workflows directly from Vue');
  backupSummaries = [];
  listBackupSummaries = async () => backupSummaries;
  await backupHistory.refresh();
  await nextTick();
  const backupEmptyState = dom.window.document.querySelector('#backupHistoryList [role="status"]');
  assert.ok(backupEmptyState, 'the loaded backup history empty state is announced as a status');
  assert.equal(backupHistoryList.getAttribute('role'), null, 'the empty state is not inside a list role');
  assert.equal(backupEmptyState.getAttribute('aria-live'), 'polite');
  assert.match(backupEmptyState.textContent, /还没有可查看的快照/);
  listBackupSummaries = async () => { throw new Error('网络不可用'); };
  await backupHistory.refresh();
  await nextTick();
  assert.equal(backupHistoryList.getAttribute('role'), null, 'the error state is not inside a list role');
  assert.equal(backupHistoryList.querySelector('[role="alert"]')?.textContent, '读取失败：网络不可用');
  assert.ok(backupHistoryList.querySelector('#backupHistoryRetry'), 'a failed history load offers an in-place retry');
  backupHistoryList.querySelector('#backupHistoryRetry').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  await nextTick();
  assert.equal(dom.window.document.activeElement?.id, 'backupHistoryRetry', 'a failed retry returns focus to the retry control');
  listBackupSummaries = async () => [{ revision: 3, created: 2 }];
  backupHistoryList.querySelector('#backupHistoryRetry').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  await nextTick();
  assert.equal(dom.window.document.querySelectorAll('#backupHistoryList .backup-row').length, 1, 'retry replaces the error with the loaded revision');
  assert.equal(dom.window.document.querySelector('#backupHistoryRetry'), null, 'the retry control leaves after recovery');
  assert.equal(dom.window.document.activeElement?.getAttribute('data-backup-download'), '3', 'successful retry moves focus to the loaded history');
  backupHistory.close();
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.querySelector('#backupHistoryOverlay').classList.contains('open'), false);

  appSettings.show();
  await nextTick();
  const backupHistoryTrigger = dom.window.document.querySelector('#backupHistory');
  backupHistoryTrigger.focus();
  assert.equal(dom.window.document.activeElement, backupHistoryTrigger, 'the backup history flow starts from its settings button');
  appSettings.close();
  backupHistory.show();
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.activeElement, dom.window.document.querySelector('#backupHistoryOverlay [role="dialog"]'), 'opening backup history focuses the dialog after settings closes');
  backupHistory.close();
  await nextTick();
  await nextTick();
  assert.notEqual(dom.window.document.activeElement, backupHistoryTrigger, 'closing backup history does not restore focus to the hidden settings button');
  assert.ok(['accountButton', 'menuBtn', 'searchTop', 'mobileSearch'].includes(dom.window.document.activeElement?.id), 'closing backup history restores focus to a visible workspace control');

  const desktopSearchButton = dom.window.document.querySelector('#searchTop');
  assert.equal(desktopSearchButton.getAttribute('aria-label'), '搜索你的知识', 'the Vue top-bar search keeps an accessible name when its text is hidden at tablet widths');
  const mobileSearchButton = dom.window.document.querySelector('#mobileSearch');
  desktopSearchButton.focus();
  assert.equal(dom.window.document.activeElement, desktopSearchButton, 'the conflict dialog test begins with its desktop search opener focused');
  syncConflict.show({ title: '本地版本', changedCount: 1, notes: [] }, { title: '服务端版本', changedCount: 1, notes: [] });
  await nextTick();
  await nextTick();
  const conflictDialog = dom.window.document.querySelector('#syncConflictDialog');
  assert.ok(conflictDialog, 'sync conflict is rendered as an in-page dialog');
  assert.equal(dom.window.document.activeElement, conflictDialog.querySelector('[aria-label="关闭"]'), 'opening sync conflict focuses its visible close action');
  desktopSearchButton.hidden = true;
  conflictDialog.querySelector('[aria-label="关闭"]').click();
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.activeElement, mobileSearchButton, `sync conflict falls back to a visible global search control when its opener is hidden; focused: ${dom.window.document.activeElement?.id || dom.window.document.activeElement?.tagName}`);
  desktopSearchButton.hidden = false;
  dom.window.document.querySelector('.note-item-menu').open = true;

  let bubbledClicks = 0;
  dom.window.document.addEventListener('click', () => { bubbledClicks += 1; });
  dom.window.document.querySelector('#toggleNoteTypes').click();
  dom.window.document.querySelector('#addNoteType').click();
  dom.window.document.querySelector('#sideTypes [data-type-edit="note"]').click();
  dom.window.document.querySelector('#sideTypes [data-type-delete="command"]').click();
  assert.equal(dom.window.document.querySelector('#addCategory'), null, 'category creation is no longer part of the sidebar');
  assert.equal(dom.window.document.querySelector('#categoryFeatureOverlay'), null, 'the category dialog is no longer mounted');
  dom.window.document.querySelector('#qidianSidebarIsland [data-dashboard]').click();
  dom.window.document.querySelector('#qidianSidebarIsland [data-nav="recent"]').click();
  dom.window.document.querySelector('#qidianSidebarIsland [data-type-nav="note"]').click();
  navigation.page = 'home';
  navigation.typeFilter = 'note';
  await nextTick();
  assert.equal(dom.window.document.querySelector('#qidianSidebarIsland [data-type-nav="note"]')?.getAttribute('aria-pressed'), 'true', 'the selected sidebar note type exposes its pressed state');
  assert.equal(dom.window.document.querySelector('#qidianSidebarIsland [data-type-nav="all"]')?.getAttribute('aria-pressed'), 'false', 'the unselected sidebar note type is announced as unpressed');
  dom.window.document.querySelector('#mobileHome').click();
  dom.window.document.querySelector('#mobileCats').click();
  dom.window.document.querySelector('#mobileNew').click();
  dom.window.document.querySelector('#mobileBookmarks').click();
  navigation.page = 'bookmarks';
  await nextTick();
  const bookmarkStatus = dom.window.document.querySelector('#dashboardHost .bookmark-page');
  assert.ok(bookmarkStatus, 'the bookmark page is mounted in the Vue workspace');
  const populatedBookmarkVault = structuredClone(vault.value);
  populatedBookmarkVault.bookmarks[0].children[0].children[0].pinned = false;
  vault.replace({ ...populatedBookmarkVault, bookmarks: [] });
  await nextTick();
  const folderListEmpty = bookmarkStatus.querySelector('.bookmark-folders .bookmark-empty');
  const bookmarkVaultEmpty = bookmarkStatus.querySelector('.bookmark-results > .empty');
  assert.equal(folderListEmpty?.getAttribute('role'), 'status', 'an empty bookmark directory is exposed as a status update');
  assert.equal(folderListEmpty?.getAttribute('aria-live'), 'polite');
  assert.equal(bookmarkVaultEmpty?.getAttribute('role'), 'status', 'an empty bookmark vault is exposed as a status update');
  assert.equal(bookmarkVaultEmpty?.getAttribute('aria-live'), 'polite');
  vault.replace(populatedBookmarkVault);
  await nextTick();
  const bookmarkSearchFieldForStatus = bookmarkStatus.querySelector('input[aria-label="搜索书签"]');
  bookmarkSearchFieldForStatus.value = '没有匹配的网址';
  bookmarkSearchFieldForStatus.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await nextTick();
  const bookmarkSearchEmpty = bookmarkStatus.querySelector('.bookmark-section .bookmark-empty');
  assert.equal(bookmarkSearchEmpty?.getAttribute('role'), 'status', 'a no-match bookmark search is exposed as a status update');
  assert.equal(bookmarkSearchEmpty?.getAttribute('aria-live'), 'polite');
  bookmarkSearchFieldForStatus.value = '';
  bookmarkSearchFieldForStatus.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await nextTick();
  bookmarks.dispatch({ type: 'select-folder', id: '' });
  bookmarks.dispatch({ type: 'toggle-pinned' });
  await nextTick();
  const bookmarkFavoritesEmpty = bookmarkStatus.querySelector('.bookmark-section .bookmark-empty');
  assert.equal(bookmarkFavoritesEmpty?.getAttribute('role'), 'status', 'an empty favorites filter is exposed as a status update');
  assert.equal(bookmarkFavoritesEmpty?.getAttribute('aria-live'), 'polite');
  bookmarks.dispatch({ type: 'toggle-pinned' });
  navigation.page = 'dashboard';
  await nextTick();
  const populatedDashboardVault = structuredClone(vault.value);
  vault.replace({ ...populatedDashboardVault, notes: [], bookmarks: [] });
  await nextTick();
  const dashboardNoteEmpty = dom.window.document.querySelector('#dashboardHost .dashboard-note-workspace .dashboard-empty > [role="status"]');
  const dashboardBookmarkEmpty = dom.window.document.querySelector('#dashboardHost .dashboard-bookmarks > .dashboard-empty > [role="status"]');
  assert.equal(dashboardNoteEmpty?.textContent, '还没有笔记', 'the dashboard announces when its note workspace becomes empty');
  assert.equal(dashboardNoteEmpty?.getAttribute('aria-live'), 'polite');
  assert.equal(dashboardBookmarkEmpty?.textContent, '还没有书签', 'the dashboard announces when its bookmark workspace becomes empty');
  assert.equal(dashboardBookmarkEmpty?.getAttribute('aria-live'), 'polite');
  assert.ok(dom.window.document.querySelector('#dashboardHost .dashboard-note-workspace [data-new="note"]'), 'the empty note state keeps its create action outside the live status');
  assert.ok(dom.window.document.querySelector('#dashboardHost .dashboard-bookmarks [data-dashboard-add-bookmark]'), 'the empty bookmark state keeps its create action outside the live status');
  vault.replace(populatedDashboardVault);
  await nextTick();
  navigation.page = 'trash';
  await nextTick();
  let recycleBinEmpty = dom.window.document.querySelector('#dashboardHost .trash-empty');
  assert.equal(recycleBinEmpty?.getAttribute('role'), 'status', 'the empty recycle bin is announced as a status update');
  assert.equal(recycleBinEmpty?.getAttribute('aria-live'), 'polite');
  vault.replace({ ...populatedDashboardVault, trash: [{ id: 'trash-status-note', kind: 'note', deletedAt: Date.now(), index: 0, item: { ...populatedDashboardVault.notes[0], id: 'trash-status-note', title: '待还原笔记' } }] });
  await nextTick();
  assert.equal(dom.window.document.querySelector('#dashboardHost .trash-empty'), null, 'a non-empty trash snapshot replaces the empty message with its entry list');
  vault.replace(populatedDashboardVault);
  await nextTick();
  recycleBinEmpty = dom.window.document.querySelector('#dashboardHost .trash-empty');
  assert.equal(recycleBinEmpty?.getAttribute('role'), 'status', 'the empty status returns after the recycle bin becomes empty again');
  navigation.page = 'dashboard';
  await nextTick();
  navigation.page = 'home';
  await nextTick();
  dom.window.document.querySelector('#dashboardHost [data-new="note"]').click();
  dom.window.document.querySelector('#dashboardHost .note-card-open[data-open="note-1"]').click();
  dom.window.document.querySelector('#dashboardHost [data-note-edit="note-1"]').click();
  dom.window.document.querySelector('#dashboardHost [data-note-delete="note-1"]').click();
  dom.window.document.querySelector('#dashboardHost .home-type-tabs [data-type="all"]').click();
  navigation.typeFilter = 'all';
  await nextTick();
  assert.equal(dom.window.document.querySelector('#dashboardHost .home-type-tabs [data-type="all"]')?.getAttribute('aria-pressed'), 'true', 'the selected note-list type filter exposes its pressed state');
  assert.equal(dom.window.document.querySelector('#dashboardHost .home-type-tabs')?.getAttribute('role'), 'group', 'the note type filters are exposed as a named control group');
  assert.equal(dom.window.document.querySelector('#dashboardHost .home-type-tabs')?.getAttribute('aria-label'), '笔记类型');
  const commandFilterNote = { ...note, id: 'command-filter-note', title: '筛选命令笔记', type: 'command', publishedSnapshot: { ...note.publishedSnapshot, title: '筛选命令笔记', type: 'command' } };
  vault.mutate(value => value.notes.push(commandFilterNote));
  await nextTick();
  const noteResultCount = dom.window.document.querySelector('#dashboardHost .note-page-layout .section-head .muted');
  assert.equal(noteResultCount?.getAttribute('role'), 'status', 'a populated result count is announced when filters change');
  assert.equal(noteResultCount?.getAttribute('aria-live'), 'polite');
  assert.equal(noteResultCount?.getAttribute('aria-atomic'), 'true');
  assert.equal(noteResultCount?.textContent, '2 篇笔记');
  dom.window.document.querySelector('#dashboardHost .home-type-tabs [data-type="command"]').click();
  assert.deepEqual(commands.at(-1), { type: 'filter-home', typeFilter: 'command' }, 'clicking a named note type dispatches that type filter');
  navigation.typeFilter = 'command';
  await nextTick();
  assert.equal(dom.window.document.querySelector('#dashboardHost .home-type-tabs [data-type="command"]')?.getAttribute('aria-pressed'), 'true', 'the active note type is exposed as pressed');
  assert.deepEqual([...dom.window.document.querySelectorAll('#dashboardHost .note-list .note-card-open')].map(card => card.getAttribute('data-open')), ['command-filter-note'], 'the named type filter shows only matching notes');
  vault.mutate(value => { value.notes = value.notes.filter(item => item.id !== 'command-filter-note'); });
  await nextTick();
  assert.equal(dom.window.document.querySelector('#dashboardHost .note-page-layout .empty')?.textContent, '命令速查类型下暂无笔记。', 'an empty type filter does not imply the whole vault has no notes');
  assert.equal(dom.window.document.querySelector('#dashboardHost .note-page-layout .empty')?.getAttribute('role'), 'status', 'an empty type-filter result is exposed as a status update');
  assert.equal(dom.window.document.querySelector('#dashboardHost .note-page-layout .empty')?.getAttribute('aria-live'), 'polite');
  navigation.noteQuery = '无匹配笔记';
  await nextTick();
  assert.equal(dom.window.document.querySelector('#dashboardHost .note-page-layout .empty')?.textContent, '当前筛选条件下没有找到匹配的笔记。');
  assert.equal(dom.window.document.querySelector('#dashboardHost .note-page-layout .empty')?.getAttribute('role'), 'status', 'an empty search result is exposed as a status update');
  assert.equal(dom.window.document.querySelector('#dashboardHost .note-page-layout .empty')?.getAttribute('aria-live'), 'polite');
  navigation.typeFilter = 'all';
  await nextTick();
  assert.equal(dom.window.document.querySelector('#dashboardHost .note-page-layout .empty')?.textContent, '没有找到匹配的笔记。');
  navigation.noteQuery = '';
  navigation.typeFilter = 'all';
  await nextTick();

  assert.deepEqual(commands, [
    { type: 'dashboard' },
    { type: 'home', category: 'recent' },
    { type: 'note-type', id: 'note' },
    { type: 'dashboard' },
    { type: 'home', category: 'all' },
    { type: 'open-create-menu' },
    { type: 'bookmarks' },
    { type: 'create-note', kind: 'note' },
    { type: 'open-note', id: 'note-1' },
    { type: 'open-note', id: 'note-1', forceEdit: true },
    { type: 'filter-home', typeFilter: 'all' },
    { type: 'filter-home', typeFilter: 'command' }
  ]);
  assert.deepEqual(shellCommands, [
    { type: 'toggle-note-types' },
    { type: 'add-note-type' },
    { type: 'edit-note-type', id: 'note' },
    { type: 'delete-note-type', id: 'command' },
    { type: 'delete-note', id: 'note-1' }
  ]);
  assert.equal(bubbledClicks, 0, 'these Vue actions do not reach the legacy document click router');
  dom.window.document.querySelector('#themeBtn').click();
  await nextTick();
  assert.equal(shell.themeMenuOpen, true, 'the Vue theme button dispatches the typed shell action');
  assert.deepEqual(shellCommands.at(-1), { type: 'toggle-theme-menu' });
  const darkThemeChoice = dom.window.document.querySelector('[data-theme-choice="dark"]');
  darkThemeChoice.focus();
  darkThemeChoice.click();
  await nextTick();
  await nextTick();
  assert.equal(shell.themePreference, 'dark', 'theme choices are routed through the shell action boundary');
  assert.equal(shell.themeMenuOpen, false);
  assert.equal(dom.window.document.activeElement.id, 'themeBtn', 'choosing a theme returns keyboard focus to its trigger');
  dom.window.document.querySelector('#themeBtn').click();
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.activeElement.dataset.themeChoice, 'dark', 'opening the theme menu focuses its current choice');
  const themeMenu = dom.window.document.querySelector('#themeMenu');
  darkThemeChoice.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
  assert.equal(dom.window.document.activeElement.dataset.themeChoice, 'light', 'ArrowUp moves to the previous theme choice');
  dom.window.document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  assert.equal(dom.window.document.activeElement.dataset.themeChoice, 'system', 'Home moves to the first theme choice');
  dom.window.document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  assert.equal(dom.window.document.activeElement.dataset.themeChoice, 'dark', 'End moves to the last theme choice');
  dom.window.document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await nextTick();
  await nextTick();
  assert.equal(themeMenu.hidden, true, 'Escape closes the theme menu');
  assert.equal(dom.window.document.activeElement.id, 'themeBtn', 'Escape returns focus to the theme trigger');
  dom.window.document.querySelector('#themeBtn').click();
  await nextTick();
  await nextTick();
  const unmountKeyboardEvents = mountWorkspaceKeyboardEvents(dom.window.document, {
    isEditing: () => false,
    openGlobalSearch: () => {}, saveDraft: () => {}, updateEditorBaseline: () => {},
    closeSearch: () => {}, closeCapture: () => {}, closeCreateMenu: () => {}, closeBackupHistory: () => {},
    closeAccountSettings: () => {}, closeThemeMenu: () => shell.closeThemeMenu(), closeAccountMenu: () => {},
    closeWorkspaceMenu: () => {}, closeSlashMenu: () => {}, openNote: () => {}
  });
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await nextTick();
  await nextTick();
  assert.equal(shell.themeMenuOpen, false);
  assert.equal(dom.window.document.activeElement.id, 'themeBtn', 'Escape returns focus to the theme trigger');
  unmountKeyboardEvents();
  dom.window.document.querySelector('#accountButton').click();
  await nextTick();
  await nextTick();
  assert.equal(shell.accountMenuOpen, true, 'the account menu is opened by its direct Vue action');
  const accountItems = [...accountMenu.querySelectorAll('[role^="menuitem"]:not([disabled])')];
  assert.equal(dom.window.document.activeElement, accountItems[0], 'opening the account menu focuses its first action');
  accountItems[0].dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(dom.window.document.activeElement, accountItems[1], 'ArrowDown moves to the next account action');
  dom.window.document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  assert.equal(dom.window.document.activeElement, accountItems.at(-1), 'End moves to the last account action');
  dom.window.document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  assert.equal(dom.window.document.activeElement, accountItems[0], 'Home moves to the first account action');
  dom.window.document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await nextTick();
  await nextTick();
  assert.equal(accountMenu.hidden, true, 'Escape closes the account menu');
  assert.equal(dom.window.document.activeElement.id, 'accountButton', 'Escape returns focus to the account trigger');
  dom.window.document.querySelector('#accountButton').click();
  await nextTick();
  await nextTick();
  dom.window.document.querySelector('#openAppSettings').click();
  await nextTick();
  assert.deepEqual(shellCommands.at(-1), { type: 'open-app-settings' });
  assert.equal(shell.accountMenuOpen, false, 'opening settings closes the account menu');
  dom.window.document.querySelector('#accountButton').click();
  await nextTick();
  dom.window.document.querySelector('#dashboardHost').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  await nextTick();
  assert.equal(shell.accountMenuOpen, false, 'clicking outside the topbar closes open menus without a global route handler');

  navigation.page = 'dashboard';
  await nextTick();
  const dashboardGroups = dom.window.document.querySelector('#dashboardHost .dashboard-bookmark-groups');
  assert.ok(dashboardGroups, 'the dashboard page is mounted as a Vue feature when its route is active');
  dom.window.document.querySelector('#dashboardHost [data-dashboard-add-bookmark]').click();
  assert.deepEqual(commands.at(-1), { type: 'add-bookmark' }, 'the Vue dashboard button dispatches add-bookmark directly through typed navigation');
  commands.pop();
  dom.window.document.querySelector('#dashboardHost [data-dashboard-layout="double"]').click();
  await nextTick();
  assert.equal(dashboardGroups.classList.contains('is-double'), true, 'the layout follows the reactive dashboard snapshot');
  assert.equal(vault.value.dashboardBookmarkLayout, 'double');
  dom.window.document.querySelector('#dashboardHost [data-dashboard-bookmark-folder="folder-reading"]').click();
  await nextTick();
  assert.equal(dom.window.document.querySelector('#dashboardHost [data-dashboard-folder="folder-reading"]').open, false, 'folder disclosure follows Pinia state rather than a direct DOM toggle');
  dom.window.document.querySelector('#dashboardHost [data-dashboard-folders="expand"]').click();
  await nextTick();
  assert.equal(dom.window.document.querySelectorAll('#dashboardHost .dashboard-bookmark-card[open]').length, 1);
  assert.equal(dashboardPersistCalls, 3, 'each changed Vue preference is persisted through its dashboard action');

  navigation.page = 'note';
  navigation.noteId = note.id;
  navigation.editing = true;
  editorData.sync({
    noteId: note.id, title: note.title, type: note.type, category: note.category, tags: note.tags.join(', '), source: note.source,
    noteTypes: [{ id: 'note', label: '普通笔记' }, { id: 'command', label: '命令速查' }], categories: ['网络'], publishLabel: '保存笔记', pasteMode: 'rich', revision: 0
  });
  editorData.setOutline([
    { level: 2, text: '网关配置', position: 2 },
    { level: 3, text: 'DNS 设置', position: 10 }
  ]);
  await nextTick();
  const mobileOutline = dom.window.document.querySelector('.editor-outline-mobile .editor-outline-link');
  const desktopOutline = dom.window.document.querySelector('.edit-inspector .editor-outline-link.level-3');
  assert.equal(mobileOutline.textContent, '网关配置');
  assert.equal(desktopOutline.textContent, 'DNS 设置');
  desktopOutline.click();
  assert.deepEqual(editorRuntimeActions, [{ group: 'outline', action: 'goto', position: 10 }], 'Vue renders outline state and dispatches a typed navigation action');
  editorData.setToolbarState({
    marks: { bold: true, italic: false, underline: false, strikeThrough: false, code: false },
    block: 'h2', inTable: true, inCodeBlock: true, inCallout: true,
    canUndo: true, canRedo: false, hasLink: true, canConvertTable: true,
    paragraph: { visible: true, moveUp: true, moveDown: false, duplicate: true, delete: true }
  });
  await nextTick();
  assert.equal(dom.window.document.querySelector('#blockSelect').value, 'h2');
  assert.equal(dom.window.document.querySelector('[data-fmt="bold"]').getAttribute('aria-pressed'), 'true');
  for (const [selector, label] of [
    ['[data-fmt="strikeThrough"]', '删除线'],
    ['[data-insert="emoji"]', '插入表情'],
    ['[data-insert="rule"]', '插入分隔线'],
    ['#fontColor', '文字颜色']
  ]) {
    assert.equal(dom.window.document.querySelector(selector)?.getAttribute('aria-label'), label, `${selector} has an explicit accessible name in the production Vue editor`);
  }
  assert.equal(dom.window.document.querySelector('.table-tools').hidden, false);
  assert.equal(dom.window.document.querySelector('.code-tools').hidden, false);
  assert.equal(dom.window.document.querySelector('[data-editor-action="undo"]').disabled, false);
  assert.equal(dom.window.document.querySelector('[data-editor-action="delete-callout"]').disabled, false);
  assert.equal(dom.window.document.querySelector('[data-block-action="moveDown"]').disabled, true);
  assert.ok(dom.window.document.querySelector('.editor-properties summary'));
  assert.ok(dom.window.document.querySelector('.editor-extra-tools summary'));
  const editorTitle = dom.window.document.querySelector('#editTitle');
  assert.equal(editorTitle.value, '路由配置');
  editorTitle.value = 'Vue 表单状态';
  editorTitle.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const editorType = dom.window.document.querySelector('#editType');
  editorType.value = 'command';
  editorType.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(dom.window.document.querySelector('#editCategory'), null, 'category is not an editable field');
  const editorTags = dom.window.document.querySelector('#editTags');
  editorTags.value = 'OpenWrt, Docker';
  editorTags.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const editorSource = dom.window.document.querySelector('#editSource');
  editorSource.value = 'https://example.com';
  editorSource.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const clicksBeforeEditorActions = bubbledClicks;
  dom.window.document.querySelector('#saveEditor').click();
  dom.window.document.querySelector('#addAttachment').click();
  dom.window.document.querySelector('#exportHtml').click();
  dom.window.document.querySelector('#addImgButton').click();
  dom.window.document.querySelector('#deleteEditorNote').click();
  assert.deepEqual(editorPageCommands, [
    { type: 'save-current' },
    { type: 'choose-attachment' },
    { type: 'export-html' },
    { type: 'choose-image' },
    { type: 'delete-current' }
  ]);
  assert.equal(bubbledClicks, clicksBeforeEditorActions, 'editor page actions do not enter the document-level compatibility click router');
  editorTitle.dispatchEvent(new dom.window.Event('blur'));
  await nextTick();
  assert.deepEqual(editorData.form, { title: 'Vue 表单状态', type: 'command', category: '网络', tags: 'OpenWrt, Docker', source: 'https://example.com' });
  assert.equal(editorFormChanges.length, 4);
  assert.deepEqual(editorFormChanges.at(-1), editorData.form, 'the form-change boundary observes v-model values before saving');
  assert.equal(editorFormBlurs, 1, 'leaving a metadata field flushes the editor save');

  const dialogSubmissions = [];
  noteTypeDialog.bindSave(input => { dialogSubmissions.push(input); noteTypeDialog.close(); });
  noteTypeDialog.open({ mode: 'create', id: null, title: '新增笔记类型', hint: '', name: '' });
  await nextTick();
  const typeName = dom.window.document.querySelector('#typeNameInput');
  typeName.value = '读书笔记';
  typeName.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  typeName.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await nextTick();
  assert.deepEqual(dialogSubmissions[0], { mode: 'create', id: null, name: '读书笔记' });

  noteTypeDialog.open({
    mode: 'delete', id: 'reading', title: '删除笔记类型', hint: '类型下的笔记会保留。', noteCount: 2,
    options: [{ id: 'note', name: '普通笔记' }, { id: 'task', name: '待办', autoCreate: true }]
  });
  const clicksBeforeDialogActions = bubbledClicks;
  await nextTick();
  assert.equal(dom.window.document.querySelector('#typeDialogHint').textContent, '类型下的笔记会保留。');
  const replacement = dom.window.document.querySelector('#typeReplacement');
  replacement.value = 'task';
  replacement.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  dom.window.document.querySelector('#typeDialogConfirm').click();
  await nextTick();
  assert.deepEqual(dialogSubmissions[1], { mode: 'delete', id: 'reading', targetId: 'task' });
  assert.equal(bubbledClicks, clicksBeforeDialogActions, 'the Vue dialog consumes its confirmation instead of triggering the legacy click router');

  const addTypeTrigger = dom.window.document.querySelector('#addNoteType');
  const sidebarElement = dom.window.document.querySelector('#sidebar');
  addTypeTrigger.focus();
  sidebarElement.setAttribute('inert', '');
  noteTypeDialog.open({ mode: 'create', id: null, title: '新增笔记类型', hint: '', name: '' });
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.activeElement, dom.window.document.querySelector('#typeNameInput'));
  noteTypeDialog.close();
  await nextTick();
  await nextTick();
  assert.ok(['menuBtn', 'searchTop', 'mobileSearch'].includes(dom.window.document.activeElement.id), `closing a type dialog restores focus to a visible menu or search control; actual: ${dom.window.document.activeElement.outerHTML}`);
  sidebarElement.removeAttribute('inert');

  const createMenuTrigger = dom.window.document.querySelector('#mobileNew');
  createMenuTrigger.focus();
  createMenu.open();
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.activeElement, dom.window.document.querySelector('#createFeatureOverlay [data-create-kind="note"]'));
  createMenuTrigger.hidden = true;
  createMenu.close();
  await nextTick();
  await nextTick();
  assert.ok(['accountButton', 'menuBtn', 'searchTop', 'mobileSearch'].includes(dom.window.document.activeElement?.id), 'closing create menu falls back to a visible workspace control when the opener becomes hidden');
  createMenuTrigger.hidden = false;

  createMenu.open();
  await nextTick();
  assert.ok(dom.window.document.querySelector('#createFeatureOverlay [role="dialog"]'));
  assert.deepEqual(Array.from(dom.window.document.querySelectorAll('#createFeatureOverlay [data-create-kind]')).map(button => button.dataset.createKind), ['note', 'bookmark', 'capture']);
  const clicksBeforeCreateAction = bubbledClicks;
  dom.window.document.querySelector('#createFeatureOverlay [data-create-kind="bookmark"]').click();
  await nextTick();
  assert.equal(createMenu.visible, false, 'selecting a create action closes the menu after navigation accepts it');
  assert.deepEqual(commands.at(-1), { type: 'create-from-menu', kind: 'bookmark' });
  assert.equal(bubbledClicks, clicksBeforeCreateAction, 'the Vue create menu dispatches a typed action without document click routing');

  const captureSubmissions = [];
  const capturePasteTargets = [];
  let rejectCapture = true;
  captureDialog.bindSave(input => {
    if (rejectCapture) throw new Error('保存失败，请重试');
    captureSubmissions.push(input);
  });
  captureDialog.bindPasteHandler(event => {
    capturePasteTargets.push(event.target?.id);
    event.preventDefault();
  });
  const captureLauncher = dom.window.document.createElement('button');
  captureLauncher.id = 'captureLauncher';
  dom.window.document.body.append(captureLauncher);
  captureLauncher.focus();
  captureDialog.open({
    types: [{ id: 'note', name: '普通笔记' }, { id: 'clip', name: '网页摘录' }],
    pasteMode: 'markdown'
  });
  await nextTick();
  assert.equal(dom.window.document.querySelector('#captureOverlay[role="dialog"]'), null);
  assert.ok(dom.window.document.querySelector('#captureOverlay form[role="dialog"]'));
  assert.deepEqual(Array.from(dom.window.document.querySelectorAll('#captureType option')).map(option => option.value), ['note', 'clip']);
  assert.equal(dom.window.document.querySelector('#captureCat'), null, 'quick capture uses note type without a category field');
  assert.equal(dom.window.document.querySelector('#captureType').value, 'clip');
  assert.equal(dom.window.document.querySelector('#capturePasteMode').value, 'markdown');

  const captureName = dom.window.document.querySelector('#captureName');
  captureName.value = '路由器维护';
  captureName.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const captureSource = dom.window.document.querySelector('#captureSource');
  captureSource.value = 'https://example.com/guide';
  captureSource.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const capturePad = dom.window.document.querySelector('#capturePad');
  const pasteEvent = new dom.window.Event('paste', { bubbles: true, cancelable: true });
  capturePad.dispatchEvent(pasteEvent);
  assert.deepEqual(capturePasteTargets, ['capturePad'], 'the Vue capture pad forwards paste directly to its feature handler');
  assert.equal(pasteEvent.defaultPrevented, true, 'the feature paste handler controls native browser insertion');
  capturePad.innerHTML = '<p>更新 DNS 配置</p>';
  dom.window.document.querySelector('#captureOverlay form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  await nextTick();
  assert.equal(captureDialog.visible, true, 'a failed save keeps the dialog available for correction or retry');
  assert.equal(dom.window.document.querySelector('#captureMessage').textContent, '保存失败，请重试');

  rejectCapture = false;
  dom.window.document.querySelector('#captureOverlay form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise(resolve => setImmediate(resolve));
  await nextTick();
  assert.deepEqual(captureSubmissions[0], {
    title: '路由器维护', type: 'clip', source: 'https://example.com/guide', body: '<p>更新 DNS 配置</p>'
  });
  assert.equal(captureDialog.visible, false, 'successful save closes the dialog only after the save handler resolves');
  assert.notEqual(dom.window.document.activeElement, captureLauncher, 'successful navigation does not steal focus back to the capture launcher');

  captureLauncher.focus();
  assert.equal(dom.window.document.activeElement, captureLauncher, 'the launcher can receive focus after the save dialog closes');
  captureDialog.open({ types: [{ id: 'clip', name: '网页摘录' }], pasteMode: 'rich' });
  await nextTick();
  await nextTick();
  assert.equal(dom.window.document.activeElement, dom.window.document.querySelector('#capturePad'), 'opening moves focus into the capture content field');
  assert.equal(captureDialog.saving, false);
  dom.window.document.querySelector('#captureOverlay .dialog-foot .secondary-btn').click();
  assert.equal(captureDialog.visible, false);
  await nextTick();
  assert.equal(dom.window.document.activeElement, captureLauncher, 'canceling restores focus to the control that opened the dialog');

  captureLauncher.blur();
  assert.equal(dom.window.document.activeElement, dom.window.document.body, 'the browser may not retain a focused opener after pointer activation');
  captureDialog.open({ types: [{ id: 'clip', name: '网页摘录' }], pasteMode: 'rich' });
  await nextTick();
  await nextTick();
  dom.window.document.querySelector('#captureOverlay .dialog-foot .secondary-btn').click();
  await nextTick();
  await nextTick();
  const expectedCaptureFallback = ['#quickCapture', '#mobileSearch', '#menuBtn', '#searchTop']
    .map(selector => dom.window.document.querySelector(selector))
    .find(target => target instanceof dom.window.HTMLElement);
  assert.ok(expectedCaptureFallback, 'the workspace provides a persistent navigation fallback');
  assert.equal(dom.window.document.activeElement, expectedCaptureFallback, 'when the opener is not focusable, canceling returns focus to the first available workspace control');

  navigation.page = 'note';
  navigation.noteId = note.id;
  navigation.editing = false;
  navigation.previewing = false;
  await nextTick();
  await nextTick();
  assert.equal(reader.active, true, 'the reader route is active in Pinia');
  assert.equal(reader.snapshot.title, '已发布版本');
  assert.ok(dom.window.document.querySelector('.reader-shell'), 'the Vue reader page is mounted');
  assert.equal(dom.window.document.querySelector('#dashboardHost').getAttribute('aria-label'), '已发布版本');
  assert.equal(dom.window.document.querySelector('.reader-shell .doc-content h2').textContent, '网关配置');
  assert.equal(dom.window.document.querySelector('.reader-source a'), null, 'the Vue reader keeps an unsafe source as plain text');
  assert.equal(dom.window.document.querySelector('.right-rail .rail-source a'), null, 'the Vue information rail does not link an unsafe source');
  assert.match(dom.window.document.querySelector('.reader-source').textContent, /javascript:alert\(1\)/);
  assert.match(dom.window.document.querySelector('.right-rail .rail-source').textContent, /javascript:alert\(1\)/);
  assert.ok(dom.window.document.querySelector('#showDraftView'));
  assert.equal(dom.window.document.querySelector('#showDraftView').textContent, '预览未发布修改', 'the control describes the draft preview that it opens');
  const clicksBeforeReaderActions = bubbledClicks;
  dom.window.document.querySelector('#editDoc').click();
  dom.window.document.querySelector('#showDraftView').click();
  dom.window.document.querySelector('#pinDoc').click();
  dom.window.document.querySelector('.document-more').open = true;
  dom.window.document.querySelector('#duplicateDoc').click();
  dom.window.document.querySelector('#deleteDoc').click();
  navigation.previewing = true;
  await nextTick();
  await nextTick();
  dom.window.document.querySelector('#publishDoc').click();
  assert.deepEqual(readerCommands, [
    { type: 'edit-current' },
    { type: 'show-pending-changes' },
    { type: 'toggle-current-pin' },
    { type: 'duplicate-current' },
    { type: 'delete-current' },
    { type: 'publish-current' }
  ]);
  assert.equal(bubbledClicks, clicksBeforeReaderActions, 'reader actions do not enter the document-level compatibility click router');

  navigation.noteId = 'missing-note';
  await nextTick();
  await nextTick();
  assert.deepEqual(commands.at(-1), { type: 'home', category: 'all' }, 'a stale reader route recovers through the typed navigation action');

  const hiddenPicker = dom.window.document.createElement('input');
  hiddenPicker.id = 'importFile';
  hiddenPicker.type = 'file';
  hiddenPicker.hidden = true;
  dom.window.document.body.append(hiddenPicker);
  dom.window.document.body.tabIndex = -1;
  dom.window.document.body.focus();
  backupImport.begin();
  await nextTick();
  await nextTick();
  assert.ok(dom.window.document.activeElement.classList.contains('backup-import-dialog'), 'import progress receives focus');
  backupImport.finish();
  await nextTick();
  await nextTick();
  assert.ok(['accountButton', 'menuBtn', 'searchTop', 'mobileSearch'].includes(dom.window.document.activeElement?.id), 'import completion returns focus from the hidden picker to a visible control');
});
