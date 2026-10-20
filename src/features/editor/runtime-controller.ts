import type { Editor } from '@tiptap/core';
import { mountEditorSearch } from './search-controller.ts';

const EDITOR_FIELDS = ['editTitle', 'editType', 'editCategory', 'editTags', 'editSource'] as const;

type PastePayload = { event: ClipboardEvent; editor: Editor };
type EditorFactoryOptions = {
  element: HTMLElement;
  content: string;
  handlePaste: (payload: PastePayload) => boolean | void;
  onUpdate: () => void;
  onSelectionUpdate: (payload: { editor: Editor }) => void;
};
type EditorFactory = (options: EditorFactoryOptions) => Editor;

type EditorRuntimeDependencies = {
  getEditor: () => Editor | null;
  setEditor: (editor: Editor | null) => void;
  getEditorFactory: () => EditorFactory | null;
  setEditorFactory: (factory: EditorFactory) => void;
  getSurface: () => HTMLElement | null;
  getElement: (selector: string) => HTMLElement | null;
  isActive: () => boolean;
  getInitialContent: () => string;
  getPasteMode: () => string;
  getDraftId: () => string | null;
  renderMarkdownPreview?: () => string;
  handlePaste: (payload: PastePayload) => boolean | void;
  onUpdate: (context: { editor: Editor; surface: HTMLElement }) => void;
  onSelectionUpdate: (payload: { editor: Editor }) => void;
  onBlur: EventListener;
  onSlashMenu: () => void;
  onFieldChange: EventListener;
  onPasteModeChange: (mode: string) => void;
  onToolbarMouseDown: EventListener;
  onMounted: (editor: Editor) => void;
  onBeforeDestroy: (editor: Editor, draftId: string | null) => void;
  shouldListenToFieldEvents?: () => boolean;
};

export function createEditorRuntimeController({
  getEditor,
  setEditor,
  getEditorFactory,
  setEditorFactory,
  getSurface,
  getElement,
  isActive,
  getInitialContent,
  getPasteMode,
  getDraftId,
  renderMarkdownPreview = () => '',
  handlePaste,
  onUpdate,
  onSelectionUpdate,
  onBlur,
  onSlashMenu,
  onFieldChange,
  onPasteModeChange,
  onToolbarMouseDown,
  onMounted,
  onBeforeDestroy,
  shouldListenToFieldEvents = () => true
}: EditorRuntimeDependencies) {
  let mountedDraftId: string | null = null;
  let searchCleanup: (() => void) | null = null;
  let listenerCleanup: Array<() => void> = [];

  function listen(target: EventTarget | null, type: string, handler: EventListener) {
    if (!target) return;
    target.addEventListener(type, handler);
    listenerCleanup.push(() => target.removeEventListener(type, handler));
  }

  function clearListeners() {
    for (const cleanup of listenerCleanup) cleanup();
    listenerCleanup = [];
  }

  async function loadFactory(): Promise<EditorFactory> {
    const currentFactory = getEditorFactory();
    if (currentFactory) return currentFactory;
    const module = await import('./editor.js');
    const factory = module.createQidianEditor as EditorFactory;
    setEditorFactory(factory);
    return factory;
  }

  function mount(): Editor | null {
    const factory = getEditorFactory();
    const surface = getSurface();
    if (!factory || !isActive() || !surface) return null;
    const existing = getEditor();
    if (existing && !existing.isDestroyed) return existing;

    const pasteMode = getElement('#editPasteMode') as HTMLSelectElement | null;
    if (pasteMode) pasteMode.value = getPasteMode();
    const editor = factory({
      element: surface,
      content: getInitialContent(),
      handlePaste,
      onUpdate: () => onUpdate({ editor, surface }),
      onSelectionUpdate
    });
    setEditor(editor);
    mountedDraftId = getDraftId();
    listen(surface, 'blur', onBlur);
    listen(surface, 'keydown', event => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key !== '/' || keyboardEvent.isComposing || keyboardEvent.ctrlKey || keyboardEvent.metaKey) return;
      const selection = surface.ownerDocument.defaultView?.getSelection();
      const anchor = selection?.anchorNode;
      const parent = anchor?.nodeType === 1 ? anchor as Element : anchor?.parentElement;
      if (parent?.closest('pre,code')) return;
      const before = anchor?.nodeType === 3 ? (anchor.textContent || '').slice(0, selection?.anchorOffset) : '';
      if (before.trim()) return;
      keyboardEvent.preventDefault();
      onSlashMenu();
    });

    if (shouldListenToFieldEvents()) {
      for (const id of EDITOR_FIELDS) {
        const field = getElement(`#${id}`);
        listen(field, 'input', onFieldChange);
        listen(field, 'change', onFieldChange);
        listen(field, 'blur', onBlur);
      }
    }
    listen(pasteMode, 'change', event => onPasteModeChange((event.currentTarget as HTMLSelectElement).value));
    const previewButton = getElement('#editorMarkdownPreviewToggle') as HTMLButtonElement | null;
    const preview = getElement('#editorMarkdownPreview');
    listen(previewButton, 'click', () => {
      if (!previewButton || !preview || !surface) return;
      if (preview.hidden) {
        preview.innerHTML = renderMarkdownPreview();
        surface.hidden = true;
        preview.hidden = false;
        previewButton.textContent = '继续编辑';
        previewButton.setAttribute('aria-pressed', 'true');
      } else {
        preview.hidden = true;
        surface.hidden = false;
        previewButton.textContent = '预览笔记格式';
        previewButton.setAttribute('aria-pressed', 'false');
        editor.commands.focus();
      }
    });
    listen(getElement('#editorToolbar'), 'mousedown', onToolbarMouseDown);
    onMounted(editor);

    searchCleanup = mountEditorSearch({
      editor,
      root: surface,
      surface,
      toggleButton: getElement('#editorFindToggle') as HTMLButtonElement,
      panel: getElement('.editor-find') as HTMLElement,
      input: getElement('#editorFindInput') as HTMLInputElement,
      count: getElement('#editorFindCount') as HTMLElement,
      previousButton: getElement('#editorFindPrev') as HTMLButtonElement,
      nextButton: getElement('#editorFindNext') as HTMLButtonElement,
      closeButton: getElement('#editorFindClose') as HTMLButtonElement
    });
    return editor;
  }

  function destroy() {
    searchCleanup?.();
    searchCleanup = null;
    clearListeners();
    const editor = getEditor();
    if (!editor) return;
    onBeforeDestroy(editor, mountedDraftId);
    editor.destroy();
    setEditor(null);
    mountedDraftId = null;
  }

  return { loadFactory, mount, destroy };
}
