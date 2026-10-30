import type { Editor } from '@tiptap/core';
import type { EditorOutlineItem } from './types';

type EditorOutlineDependencies = {
  getEditor: () => Editor | null;
  setOutline: (items: EditorOutlineItem[]) => void;
};

export function createEditorOutlineController(dependencies: EditorOutlineDependencies) {
  function sync(editor = dependencies.getEditor()): EditorOutlineItem[] {
    if (!editor) {
      dependencies.setOutline([]);
      return [];
    }

    const items: EditorOutlineItem[] = [];
    editor.state.doc.descendants((node, position) => {
      if (node.type.name !== 'heading') return;
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      const level = Number(node.attrs.level);
      if (!text || !Number.isInteger(level) || level < 1 || level > 6) return;
      items.push({ level, text, position: position + 1 });
    });
    dependencies.setOutline(items);
    return items;
  }

  function goTo(position: number) {
    const editor = dependencies.getEditor();
    if (!editor || !Number.isFinite(position)) return;
    const safePosition = Math.min(Math.max(1, Math.trunc(position)), editor.state.doc.content.size);
    editor.commands.setTextSelection(safePosition);
    editor.commands.focus();
    const heading = editor.view.nodeDOM(Math.max(0, safePosition - 1)) as HTMLElement | null;
    heading?.scrollIntoView?.({ block: 'center' });
  }

  return { sync, goTo };
}
