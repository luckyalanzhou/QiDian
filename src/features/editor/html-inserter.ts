type EditorChain = {
  focus: () => EditorChain;
  insertContent: (html: string, options: { parseOptions: { preserveWhitespace: 'full' } }) => EditorChain;
  run: () => unknown;
};

type EditorInstance = { chain: () => EditorChain };

type EditorHtmlInserterDependencies = {
  getEditor: () => EditorInstance | null;
  sanitize: (html: string) => string;
  afterInsert: () => void;
};

/** Inserts sanitized HTML into the active editor and synchronizes its draft. */
export function createEditorHtmlInserter({ getEditor, sanitize, afterInsert }: EditorHtmlInserterDependencies) {
  function insert(html: string): void {
    const editor = getEditor();
    if (!editor) return;

    editor.chain()
      .focus()
      .insertContent(sanitize(html), { parseOptions: { preserveWhitespace: 'full' } })
      .run();
    afterInsert();
  }

  return { insert };
}
