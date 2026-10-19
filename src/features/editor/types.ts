export type EditorOption = { id: string; label: string };

export type EditorAction =
  | {
      group: 'format';
      action:
        | 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'code'
        | 'insertUnorderedList' | 'insertOrderedList' | 'toggleTaskList'
        | 'justifyLeft' | 'justifyCenter' | 'foreColor' | 'createLink' | 'formatBlock';
      value?: string;
    }
  | { group: 'insert'; action: 'code' | 'table' | 'image' | 'rule' | 'callout' | 'details' | 'link' | 'emoji' }
  | { group: 'table'; action: 'addRowAfter' | 'addColumnAfter' | 'deleteRow' | 'deleteColumn' | 'deleteTable' }
  | { group: 'editor'; action: 'undo' | 'redo' | 'clear-format' | 'unlink' | 'delete-code-block' | 'delete-callout' | 'convert-table' }
  | { group: 'paragraph'; action: 'moveUp' | 'moveDown' | 'duplicate' | 'delete' }
  | { group: 'outline'; action: 'goto'; position: number };

export type EditorOutlineItem = { level: number; text: string; position: number };

export type EditorSnapshot = {
  noteId: string;
  noteTypes: EditorOption[];
  categories: string[];
  publishLabel: string;
  pasteMode: string;
  revision: number;
};

export type EditorForm = {
  title: string;
  type: string;
  category: string;
  tags: string;
  source: string;
};

export type EditorToolbarState = {
  marks: { bold: boolean; italic: boolean; underline: boolean; strikeThrough: boolean; code: boolean };
  block: 'p' | 'h2' | 'h3' | 'blockquote';
  inTable: boolean;
  inCodeBlock: boolean;
  inCallout: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasLink: boolean;
  canConvertTable: boolean;
  paragraph: { visible: boolean; moveUp: boolean; moveDown: boolean; duplicate: boolean; delete: boolean };
};

export type EditorSession = EditorSnapshot & EditorForm;
