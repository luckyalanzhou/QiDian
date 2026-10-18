import { Editor } from '@tiptap/core';
import { qidianEditorExtensions } from './editor-extensions.js';

export function createQidianEditor({ element, content = '', onUpdate, onSelectionUpdate, handlePaste }) {
  let editor;
  const handlePasteEvent = handlePaste ? (_view, event) => handlePaste({ event, editor }) : undefined;
  editor = new Editor({
    element,
    extensions: qidianEditorExtensions,
    content,
    editorProps: {
      attributes: {
        class: 'editor-surface doc-content',
        'aria-label': '笔记正文',
        spellcheck: 'true',
        'data-placeholder': '开始输入内容，或直接粘贴网页文字、表格和图片...',
      },
      handlePaste: handlePasteEvent,
    },
    onUpdate: onUpdate || (() => {}),
    onSelectionUpdate: onSelectionUpdate || (() => {}),
  });
  return editor;
}
