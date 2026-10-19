import type { Editor } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';
import { parseDelimitedTable } from './command-controller.ts';
import type { EditorToolbarState } from './types';

export function createEditorToolbarState(editor: Editor): EditorToolbarState {
  const { $from } = editor.state.selection;
  let depth = $from.depth;
  while (depth > 0 && !$from.node(depth).isTextblock) depth--;
  const node = depth ? $from.node(depth) : null;
  const parent = depth ? $from.node(depth - 1) : null;
  const index = depth ? $from.index(depth - 1) : -1;
  const current = node && parent?.content.child(index);
  const previous = index > 0 ? parent?.content.child(index - 1) : null;
  const next = index >= 0 && index + 1 < (parent?.childCount || 0) ? parent?.content.child(index + 1) : null;
  const canReplace = (from: number, to: number, content: Array<typeof current> = []) =>
    !!parent?.canReplace(from, to, Fragment.fromArray(content.filter(Boolean) as NonNullable<typeof current>[]));
  const selection = editor.state.selection;
  const selectedText = selection.empty ? '' : selection.content().content.textBetween(0, selection.content().content.size, '\n');

  return {
    marks: {
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strikeThrough: editor.isActive('strike'),
      code: editor.isActive('code')
    },
    block: editor.isActive('heading', { level: 2 }) ? 'h2'
      : editor.isActive('heading', { level: 3 }) ? 'h3'
        : editor.isActive('blockquote') ? 'blockquote' : 'p',
    inTable: editor.isActive('table'),
    inCodeBlock: editor.isActive('codeBlock'),
    inCallout: editor.isActive('callout'),
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
    hasLink: editor.isActive('link'),
    canConvertTable: !!parseDelimitedTable(selectedText),
    paragraph: {
      visible: !!node,
      moveUp: !!previous && !!current && canReplace(index - 1, index + 1, [current, previous]),
      moveDown: !!next && !!current && canReplace(index, index + 2, [next, current]),
      duplicate: !!current && canReplace(index, index, [current]),
      delete: !!current && canReplace(index, index + 1)
    }
  };
}
