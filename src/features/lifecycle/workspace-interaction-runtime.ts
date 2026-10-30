import { mountModalFocusLoop } from '../dialogs/modal-focus-loop.ts';
import { mountEditorDocumentLifecycle, type EditorDocumentLifecycleActions } from '../editor/document-lifecycle.ts';
import { mountBackupImportFileEvents } from '../settings/import-file-events.ts';
import { mountEditorFileInputEvents, type EditorFileInputActions } from '../editor/file-input-events.ts';
import { mountItemMenuController } from '../navigation/item-menu-controller.ts';
import { mountWorkspaceClickRouter, type WorkspaceClickHandler } from '../navigation/workspace-click-router.ts';
import { mountWorkspaceKeyboardEvents, type WorkspaceKeyboardActions } from '../navigation/workspace-keyboard-events.ts';
import { mountWorkspaceStaticDomEvents, type WorkspaceStaticDomEventsDependencies } from '../navigation/workspace-static-dom-events.ts';

export type WorkspaceInteractionRuntimeOptions = {
  document: Document;
  window: Window & typeof globalThis;
  staticDom: WorkspaceStaticDomEventsDependencies | null;
  editorLifecycle: EditorDocumentLifecycleActions;
  routeHandlers: WorkspaceClickHandler[];
  handleChange: ((target: EventTarget | null) => void) | null;
  editorFiles: EditorFileInputActions;
  importBackupFile: (file: File) => void | Promise<void>;
  keyboard: WorkspaceKeyboardActions;
};

/** Owns browser event subscriptions for one mounted workspace session. */
export function mountWorkspaceInteractionRuntime(options: WorkspaceInteractionRuntimeOptions) {
  const { document, window } = options;
  const itemMenus = mountItemMenuController(document, window);
  const disposeStaticDom = options.staticDom
    ? mountWorkspaceStaticDomEvents(document, options.staticDom)
    : () => undefined;
  const disposeModalFocus = mountModalFocusLoop(document);
  const disposeEditorLifecycle = mountEditorDocumentLifecycle(document, options.editorLifecycle);
  const disposeClickRouter = options.routeHandlers.length
    ? mountWorkspaceClickRouter(document, options.routeHandlers)
    : () => undefined;
  const disposeEditorFiles = mountEditorFileInputEvents(document, options.editorFiles);
  const disposeBackupImport = mountBackupImportFileEvents(document, options.importBackupFile);
  const disposeKeyboard = mountWorkspaceKeyboardEvents(document, options.keyboard);
  const handleChange = options.handleChange ? (event: Event) => options.handleChange?.(event.target) : null;
  if (handleChange) document.addEventListener('change', handleChange);

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    if (handleChange) document.removeEventListener('change', handleChange);
    disposeKeyboard();
    disposeBackupImport();
    disposeEditorFiles();
    disposeClickRouter();
    disposeEditorLifecycle();
    disposeModalFocus();
    disposeStaticDom();
    itemMenus.destroy();
  };
}
