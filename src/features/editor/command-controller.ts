import type { Editor, JSONContent } from '@tiptap/core';
import { Fragment } from '@tiptap/pm/model';

export type EditorCommand = 'undo' | 'redo' | 'clear-format' | 'unlink' | 'delete-code-block' | 'delete-callout' | 'convert-table';
export type ParagraphCommand = 'duplicate' | 'delete' | 'moveUp' | 'moveDown';
export type TableCommand = 'addRowAfter' | 'addColumnAfter' | 'deleteRow' | 'deleteColumn' | 'deleteTable';
export type FormatCommand =
  | 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'code'
  | 'insertUnorderedList' | 'insertOrderedList' | 'toggleTaskList'
  | 'justifyLeft' | 'justifyCenter' | 'foreColor' | 'createLink' | 'formatBlock';

type EditorCommandDependencies = {
  getEditor: () => Editor | null;
  afterChange: (editor: Editor | null) => void;
  toast: (message: string) => void;
};

// The editor's commands are assembled from extensions in editor-extensions.js.
// Keep that runtime boundary explicit until those custom extensions are typed.
type QidianCommandChain = {
  focus(): QidianCommandChain;
  run(): boolean;
  undo(): QidianCommandChain;
  redo(): QidianCommandChain;
  unsetAllMarks(): QidianCommandChain;
  clearNodes(): QidianCommandChain;
  extendMarkRange(name: string): QidianCommandChain;
  unsetMark(name: string): QidianCommandChain;
  selectParentNode(): QidianCommandChain;
  deleteSelection(): QidianCommandChain;
  insertContent(content: JSONContent): QidianCommandChain;
  deleteTable(): QidianCommandChain;
  addRowAfter(): QidianCommandChain;
  addColumnAfter(): QidianCommandChain;
  deleteRow(): QidianCommandChain;
  deleteColumn(): QidianCommandChain;
  toggleBold(): QidianCommandChain;
  toggleItalic(): QidianCommandChain;
  toggleUnderline(): QidianCommandChain;
  toggleStrike(): QidianCommandChain;
  toggleCode(): QidianCommandChain;
  toggleBulletList(): QidianCommandChain;
  toggleOrderedList(): QidianCommandChain;
  toggleTaskList(): QidianCommandChain;
  setTextAlign(alignment: 'left' | 'center'): QidianCommandChain;
  setColor(color: string | null): QidianCommandChain;
  setMark(name: string, attributes: { href: string | null }): QidianCommandChain;
  setParagraph(): QidianCommandChain;
  setHeading(options: { level: 2 | 3 }): QidianCommandChain;
  toggleBlockquote(): QidianCommandChain;
};

function focusedChain(editor: Editor): QidianCommandChain {
  return editor.chain().focus() as unknown as QidianCommandChain;
}

export function parseDelimitedTable(value: unknown): string[][] | null {
  const text = String(value || '').trim();
  if (!text) return null;
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  const delimiter = lines.some(line => line.includes('\t')) ? '\t' : lines.some(line => line.includes('|')) ? '|' : null;
  if (!delimiter) return null;
  const rows = lines.map(line => delimiter === '|'
    ? line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
    : line.split('\t').map(cell => cell.trim()));
  if (delimiter === '|' && rows.length > 1 && rows[1].every(cell => /^:?-{3,}:?$/.test(cell))) rows.splice(1, 1);
  if (rows.length < 1 || rows.length > 50) return null;
  const columns = Math.max(...rows.map(row => row.length));
  if (columns < 2 || columns > 12) return null;
  return rows.map(row => Array.from({ length: columns }, (_, index) => row[index] || ''));
}

export function createEditorCommandController({ getEditor, afterChange, toast }: EditorCommandDependencies) {
  const changed = () => afterChange(getEditor());

  function runEditorAction(action: EditorCommand) {
    const editor = getEditor();
    if (!editor) return;
    const chain = focusedChain(editor);
    if (action === 'undo') chain.undo().run();
    else if (action === 'redo') chain.redo().run();
    else if (action === 'clear-format') chain.unsetAllMarks().clearNodes().run();
    else if (action === 'unlink' && editor.isActive('link')) chain.extendMarkRange('link').unsetMark('link').run();
    else if (action === 'delete-code-block' && editor.isActive('codeBlock')) chain.selectParentNode().deleteSelection().run();
    else if (action === 'delete-callout' && editor.isActive('callout')) (chain as QidianCommandChain & { deleteNode(name: string): QidianCommandChain }).deleteNode('callout').run();
    else if (action === 'convert-table') {
      const selection = editor.state.selection;
      const content = selection.content().content;
      const rows = parseDelimitedTable(content.textBetween(0, content.size, '\n'));
      if (!rows) {
        toast('请选择至少两列的制表符或 Markdown 表格文本');
        return;
      }
      const table: JSONContent = {
        type: 'table',
        content: rows.map((row, rowIndex) => ({
          type: 'tableRow',
          content: row.map(cell => ({
            type: rowIndex === 0 ? 'tableHeader' : 'tableCell',
            content: [{ type: 'paragraph', content: cell ? [{ type: 'text', text: cell }] : [] }]
          }))
        }))
      };
      focusedChain(editor).insertContent(table).run();
    }
    changed();
  }

  function runParagraphAction(action: ParagraphCommand) {
    const editor = getEditor();
    if (!editor) return;
    const { $from } = editor.state.selection;
    let depth = $from.depth;
    while (depth > 0 && !$from.node(depth).isTextblock) depth--;
    if (!depth) return;
    const parentDepth = depth - 1;
    const parent = $from.node(parentDepth);
    const index = $from.index(parentDepth);
    const node = parent.child(index);
    const children = Array.from({ length: parent.childCount }, (_, itemIndex) => parent.child(itemIndex));
    const nextChildren = [...children];
    let target = index;
    if (action === 'duplicate') {
      nextChildren.splice(index + 1, 0, node);
      target = index + 1;
    } else if (action === 'delete') {
      nextChildren.splice(index, 1);
      target = Math.min(index, nextChildren.length - 1);
    } else if (action === 'moveUp') {
      if (index < 1) return;
      [nextChildren[index - 1], nextChildren[index]] = [nextChildren[index], nextChildren[index - 1]];
      target = index - 1;
    } else if (action === 'moveDown') {
      if (index >= children.length - 1) return;
      [nextChildren[index], nextChildren[index + 1]] = [nextChildren[index + 1], nextChildren[index]];
      target = index + 1;
    }
    const replacement = Fragment.fromArray(nextChildren);
    if (!parent.canReplace(0, parent.childCount, replacement)) return;
    const start = parentDepth === 0 ? 0 : $from.before(parentDepth) + 1;
    const end = start + parent.content.size;
    editor.view.dispatch(editor.state.tr.replaceWith(start, end, replacement));
    if (target >= 0) {
      let targetPosition = start;
      for (let itemIndex = 0; itemIndex < target; itemIndex++) targetPosition += nextChildren[itemIndex].nodeSize;
      editor.commands.setTextSelection(Math.min(targetPosition + 1, editor.state.doc.content.size - 1));
    }
    editor.commands.focus();
    changed();
  }

  function runTableAction(action: TableCommand) {
    const editor = getEditor();
    if (!editor?.isActive('table')) return;
    const { $from } = editor.state.selection;
    let tableDepth = $from.depth;
    while (tableDepth > 0 && $from.node(tableDepth).type.name !== 'table') tableDepth--;
    const table = tableDepth > 0 ? $from.node(tableDepth) : null;
    if (!table) return;
    const rows = table.childCount;
    const columns = table.firstChild?.childCount || 0;
    const removesLastDimension = (action === 'deleteRow' && rows <= 1) || (action === 'deleteColumn' && columns <= 1);
    const chain = focusedChain(editor);
    if (removesLastDimension || action === 'deleteTable') chain.deleteTable().run();
    else if (action === 'addRowAfter') chain.addRowAfter().run();
    else if (action === 'addColumnAfter') chain.addColumnAfter().run();
    else if (action === 'deleteRow') chain.deleteRow().run();
    else if (action === 'deleteColumn') chain.deleteColumn().run();
    changed();
  }

  function doFormat(command: FormatCommand, value: string | null = null) {
    const editor = getEditor();
    if (!editor) return;
    const chain = focusedChain(editor);
    if (command === 'bold') chain.toggleBold().run();
    else if (command === 'italic') chain.toggleItalic().run();
    else if (command === 'underline') chain.toggleUnderline().run();
    else if (command === 'strikeThrough') chain.toggleStrike().run();
    else if (command === 'code') chain.toggleCode().run();
    else if (command === 'insertUnorderedList') chain.toggleBulletList().run();
    else if (command === 'insertOrderedList') chain.toggleOrderedList().run();
    else if (command === 'toggleTaskList') chain.toggleTaskList().run();
    else if (command === 'justifyLeft') chain.setTextAlign('left').run();
    else if (command === 'justifyCenter') chain.setTextAlign('center').run();
    else if (command === 'foreColor') chain.setColor(value).run();
    else if (command === 'createLink') chain.setMark('link', { href: value }).run();
    else if (command === 'formatBlock') {
      if (value === 'p') chain.setParagraph().run();
      else if (value === 'h2' || value === 'h3') chain.setHeading({ level: Number(value.slice(1)) as 2 | 3 }).run();
      else if (value === 'blockquote') chain.toggleBlockquote().run();
    }
    changed();
  }

  return { runEditorAction, runParagraphAction, runTableAction, doFormat };
}
