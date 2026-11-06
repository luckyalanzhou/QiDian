import type { Editor } from '@tiptap/core';
import { createEditorToolbarState } from '../features/editor/toolbar-state.ts';
import { createEditorToolbarEvents } from '../features/editor/toolbar-events.ts';
import { createLegacyEditorToolbarView } from '../compat/editor/legacy-toolbar-view.ts';
import type { EditorCommand, FormatCommand, ParagraphCommand, TableCommand } from '../features/editor/command-controller.ts';
import type { EditorToolbarState } from '../features/editor/types.ts';

type ToolbarState = EditorToolbarState;
type ToolbarCommands = {
  runEditorAction: (action: EditorCommand) => unknown;
  runParagraphAction: (action: ParagraphCommand) => unknown;
  runTableAction: (action: TableCommand) => unknown;
  doFormat: (command: FormatCommand, argument?: string | null) => unknown;
};

export type WorkspaceEditorToolbarDependencies = {
  usesVueWorkspace: boolean;
  document: Document;
  window: Window & typeof globalThis;
  getToolbar: () => HTMLElement | null;
  getMain: () => HTMLElement;
  getElement: (selector: string) => HTMLElement | null;
  getEditing: () => boolean;
  getEditor: () => Editor | null;
  getCommands: () => ToolbarCommands;
  setVueToolbarState: (state: ToolbarState) => void;
  icons: (name: string) => string;
  closeSlashMenu: () => void;
  insert: (kind: string) => Promise<void> | void;
  updateDraftFromDOM: () => void;
  scheduleSave: () => void;
};

export function createWorkspaceEditorToolbar(dependencies: WorkspaceEditorToolbarDependencies) {
  const runEditorAction = (action: EditorCommand) => dependencies.getCommands().runEditorAction(action);
  const runParagraphAction = (action: ParagraphCommand) => dependencies.getCommands().runParagraphAction(action);
  const runTableAction = (action: TableCommand) => dependencies.getCommands().runTableAction(action);
  const doFormat = (command: FormatCommand, argument: string | null = null) => {
    if (!dependencies.getEditor()) return;
    return dependencies.getCommands().doFormat(command, argument);
  };

  const legacyView = dependencies.usesVueWorkspace ? null : createLegacyEditorToolbarView({
    document: dependencies.document,
    window: dependencies.window,
    getToolbar: dependencies.getToolbar,
    getMain: dependencies.getMain,
    getElement: dependencies.getElement,
    getToolbarState: createEditorToolbarState,
    getEditing: dependencies.getEditing,
    icons: dependencies.icons,
    onEditorAction: action => runEditorAction(action as EditorCommand),
    onParagraphAction: action => runParagraphAction(action as ParagraphCommand),
    onDeleteCallout: () => {
      const editor = dependencies.getEditor();
      if (!editor?.isActive('callout')) return;
      editor.chain().focus().deleteNode('callout').run();
      dependencies.updateDraftFromDOM();
      dependencies.scheduleSave();
    }
  });

  const events = dependencies.usesVueWorkspace ? null : createEditorToolbarEvents({
    closeSlashMenu: dependencies.closeSlashMenu,
    format: (command, argument) => doFormat(command as FormatCommand, argument),
    insert: dependencies.insert,
    tableAction: action => runTableAction(action as TableCommand)
  });

  return {
    events,
    sync(editor: Editor | null) {
      if (!editor) return;
      if (dependencies.usesVueWorkspace) {
        dependencies.setVueToolbarState(createEditorToolbarState(editor));
        return;
      }
      legacyView?.sync(editor);
    },
    organizeDocumentActions: () => legacyView?.organizeDocumentActions(),
    organize: () => legacyView?.organize(),
    doFormat
  };
}
