import type { Editor } from '@tiptap/core';
import type { NoteType, VaultData, VaultNote } from '../../shared/api-contracts.js';
import { createEditorActionDispatcher } from '../features/editor/action-dispatcher.ts';
import { createEditorCommandController } from '../features/editor/command-controller.ts';
import { createEditorOutlineController } from '../features/editor/outline-controller.ts';
import { createEditorPageLifecycle } from '../features/editor/page-lifecycle.ts';
import { createEditorPagePreparation } from '../features/editor/page-preparation.ts';
import { createEditorRuntimeController } from '../features/editor/runtime-controller.ts';
import { createLegacyEditorOutlineView } from '../compat/editor/legacy-editor-outline-view.ts';
import { createLegacyEditorPageController } from '../compat/editor/legacy-page-controller.ts';
import { renderLegacyEditorMarkup } from '../compat/editor/legacy-editor-view.js';
import type { useEditorStore } from '../features/editor/store.ts';
import type { useNavigationStore } from '../features/navigation/store.ts';
import type { EditorAction, EditorSession } from '../features/editor/types.ts';
import type { EditorSessionSnapshotInput } from '../features/editor/session-snapshot.ts';

type RuntimeDependencies = Parameters<typeof createEditorRuntimeController>[0];
type EditorState = Pick<RuntimeDependencies, 'getEditor' | 'setEditor' | 'getEditorFactory' | 'setEditorFactory'>;

type WorkspaceEditorRuntimeDependencies = {
  document: Document;
  window: Window & typeof globalThis;
  main: HTMLElement;
  getElement: RuntimeDependencies['getElement'];
  usesVueWorkspace: boolean;
  state: EditorState;
  editorStore: ReturnType<typeof useEditorStore>;
  navigationStore: ReturnType<typeof useNavigationStore>;
  ensureDraft: () => VaultNote;
  getVault: () => VaultData;
  getEditorOptions: () => { noteTypes: NoteType[]; categories: string[] };
  getPasteMode: () => string;
  createSession: (input: EditorSessionSnapshotInput) => Omit<EditorSession, 'revision'>;
  updateDraftFromDOM: () => void;
  scheduleSave: () => void;
  afterEditorChange: (editor: Editor) => void;
  flushEditorSave: () => unknown;
  saveDraft: (quiet?: boolean) => unknown;
  handlePaste: RuntimeDependencies['handlePaste'];
  openSlashMenu: () => void;
  syncToolbarState: (editor: Editor) => void;
  organizeEditorTools: () => void;
  insert: (action: Extract<EditorAction, { group: 'insert' }>['action']) => void | Promise<void>;
  mutateVault: (operation: (vault: VaultData) => void) => unknown;
  cleanHTML: (html: string, preserveImages?: boolean) => string;
  escapeHTML: (value: unknown) => string;
  isDraft: (note: VaultNote) => boolean;
  setBreadcrumb: (title: string) => void;
  displayTypeName: (type: NoteType) => string;
  icons: string;
  toast: (message: string) => void;
};

/** Owns editor runtime, outline, lifecycle, and legacy editor presentation wiring. */
export function createWorkspaceEditorRuntime(dependencies: WorkspaceEditorRuntimeDependencies) {
  const { document, window, main, editorStore, navigationStore, state } = dependencies;
  let editorCommands: ReturnType<typeof createEditorCommandController> | null = null;
  const outline = createEditorOutlineController({
    getEditor: state.getEditor,
    setOutline: items => editorStore.setOutline(items)
  });
  const legacyOutline = dependencies.usesVueWorkspace
    ? null
    : createLegacyEditorOutlineView({ document, main });

  function refreshEditorOutline(editor = state.getEditor()) {
    outline.sync(editor);
    if (!dependencies.usesVueWorkspace) legacyOutline?.render(editor);
  }

  function ensureCommands() {
    if (!editorCommands) {
      editorCommands = createEditorCommandController({
        getEditor: state.getEditor,
        afterChange: editor => {
          if (!editor) return;
          dependencies.afterEditorChange(editor);
        },
        toast: dependencies.toast
      });
    }
    return editorCommands;
  }

  const runtime = createEditorRuntimeController({
    ...state,
    getSurface: () => dependencies.getElement('#editorSurface'),
    getElement: dependencies.getElement,
    isActive: () => navigationStore.editing && navigationStore.page === 'note',
    getInitialContent: () => dependencies.cleanHTML(dependencies.ensureDraft().body, true),
    getPasteMode: dependencies.getPasteMode,
    getDraftId: () => dependencies.ensureDraft().id,
    renderMarkdownPreview: () => `<pre>${dependencies.escapeHTML(state.getEditor()?.getText({ blockSeparator: '\n\n' }) || '')}</pre>`,
    handlePaste: dependencies.handlePaste,
    onUpdate: ({ editor, surface }) => {
      dependencies.updateDraftFromDOM();
      dependencies.scheduleSave();
      refreshEditorOutline(editor);
      if (surface.textContent.endsWith('/')) dependencies.openSlashMenu();
    },
    onSelectionUpdate: ({ editor }) => dependencies.syncToolbarState(editor),
    onBlur: dependencies.flushEditorSave,
    onSlashMenu: dependencies.openSlashMenu,
    onFieldChange: () => {
      dependencies.updateDraftFromDOM();
      dependencies.scheduleSave();
    },
    shouldListenToFieldEvents: () => !dependencies.usesVueWorkspace,
    onPasteModeChange: mode => {
      dependencies.mutateVault(vault => { vault.pasteMode = mode as NonNullable<VaultData['pasteMode']>; });
      dependencies.saveDraft(true);
    },
    onToolbarMouseDown: event => {
      ensureCommands().captureToolbarSelection();
      if ((event.target as Element | null)?.closest('button, summary')) event.preventDefault();
    },
    onMounted: editor => {
      dependencies.syncToolbarState(editor);
      if (!dependencies.usesVueWorkspace) dependencies.organizeEditorTools();
      dependencies.syncToolbarState(editor);
      refreshEditorOutline(editor);
      ensureCommands();
    },
    onBeforeDestroy: (_editor, draftId) => {
      if (navigationStore.editing && navigationStore.editingDraft && draftId === navigationStore.editingDraft.id) {
        dependencies.updateDraftFromDOM();
      }
    }
  });

  const dispatcher = createEditorActionDispatcher({
    isReady: () => Boolean(state.getEditor()),
    goToOutline: position => outline.goTo(position),
    format: (action, value) => ensureCommands().doFormat(action, value),
    insert: action => dependencies.insert(action),
    table: action => ensureCommands().runTableAction(action),
    editor: action => ensureCommands().runEditorAction(action),
    paragraph: action => ensureCommands().runParagraphAction(action)
  });

  function mountEditorSurface() {
    if (!state.getEditorFactory() || !navigationStore.editing || navigationStore.page !== 'note' || !dependencies.getElement('#editorSurface')) return;
    const editor = runtime.mount();
    if (editor) ensureCommands();
    return editor;
  }

  const pageLifecycle = createEditorPageLifecycle({
    getFactory: state.getEditorFactory,
    loadFactory: () => runtime.loadFactory(),
    isActive: () => navigationStore.editing && navigationStore.page === 'note',
    mount: mountEditorSurface,
    focusTitle: () => setTimeout(() => dependencies.getElement('#editTitle')?.focus(), 0),
    onLoadError: error => {
      const surface = dependencies.getElement('#editorSurface');
      if (surface) surface.innerHTML = '<p class="hint">编辑器加载失败，请刷新后重试。</p>';
      dependencies.toast(error instanceof Error ? error.message : '编辑器加载失败');
    }
  });

  const pagePreparation = createEditorPagePreparation({
    destroyEditor: () => runtime.destroy(),
    ensureDraft: dependencies.ensureDraft,
    getOptions: dependencies.getEditorOptions,
    getPasteMode: dependencies.getPasteMode,
    createSession: dependencies.createSession,
    sync: session => editorStore.sync({ ...session, revision: 0 })
  });

  function renderLegacyEditorReady() {
    runtime.destroy();
    const note = dependencies.ensureDraft();
    dependencies.setBreadcrumb(note.title || '新建笔记');
    const publishLabel = dependencies.isDraft(note) ? '发布笔记' : '保存笔记';
    main.innerHTML = renderLegacyEditorMarkup({
      note,
      noteTypes: dependencies.getVault().noteTypes,
      publishLabel,
      icons: dependencies.icons,
      escapeHtml: dependencies.escapeHTML,
      displayTypeName: dependencies.displayTypeName,
      preferredPasteMode: dependencies.getPasteMode
    });
    mountEditorSurface();
  }

  const legacyPage = dependencies.usesVueWorkspace ? null : createLegacyEditorPageController({
    getFactory: state.getEditorFactory,
    setFactory: state.setEditorFactory,
    loadFactory: () => runtime.loadFactory(),
    isActive: () => navigationStore.editing && navigationStore.page === 'note',
    renderLoading: () => { main.innerHTML = '<div class="empty editor-loading">正在加载富文本编辑器…</div>'; },
    renderPage: renderLegacyEditorReady,
    focusTitle: () => setTimeout(() => dependencies.getElement('#editTitle')?.focus(), 0),
    renderFailure: () => { main.innerHTML = '<div class="empty editor-loading">编辑器加载失败，请刷新后重试。</div>'; },
    onLoadError: error => dependencies.toast(error instanceof Error ? error.message : '编辑器加载失败')
  });

  return {
    bindRuntime: () => editorStore.bindRuntime({
      initialize: () => pageLifecycle.initialize(),
      dispatch: action => dispatcher.dispatch(action),
      formChanged: () => {
        dependencies.updateDraftFromDOM();
        dependencies.scheduleSave();
      },
      formBlurred: () => { dependencies.flushEditorSave(); }
    }),
    destroy: () => {
      if (state.getEditor()) runtime.destroy();
      legacyOutline?.dispose();
    },
    refreshOutline: refreshEditorOutline,
    ensureCommands,
    prepareVueEditorPage: () => pagePreparation.prepare(),
    renderLegacyEditor: () => legacyPage?.render()
  };
}
