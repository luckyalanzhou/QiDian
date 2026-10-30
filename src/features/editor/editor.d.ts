import type { Editor } from '@tiptap/core';

export type QidianEditorOptions = {
  element: HTMLElement;
  content?: string;
  handlePaste?: (payload: { event: ClipboardEvent; editor: Editor }) => boolean | void;
  onUpdate?: (payload: { editor: Editor }) => void;
  onSelectionUpdate?: (payload: { editor: Editor }) => void;
};

export function createQidianEditor(options: QidianEditorOptions): Editor;
