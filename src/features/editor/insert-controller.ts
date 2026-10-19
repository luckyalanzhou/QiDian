type InsertEditorChain = {
  focus(): InsertEditorChain;
  insertTable(options: { rows: number; cols: number; withHeaderRow: boolean }): InsertEditorChain;
  extendMarkRange(name: string): InsertEditorChain;
  setMark(name: string, attributes: { href: string }): InsertEditorChain;
  run(): boolean;
};

type InsertEditor = {
  chain: () => InsertEditorChain;
  commands: { focus: () => unknown; scrollIntoView: () => unknown };
  isActive: (name: string) => boolean;
  getAttributes: (name: string) => Record<string, unknown>;
  state: { selection: { from: number; to: number } };
};

type InsertPromptOptions = {
  title: string;
  inputLabel: string;
  confirmText: string;
  maxLength: number;
};

type EditorInsertDependencies = {
  getEditor: () => InsertEditor | null;
  insertHTML: (html: string) => void;
  openImagePicker: () => void;
  prompt: (message: string, value: string, options: InsertPromptOptions) => Promise<string | null>;
  format: (command: 'createLink', value: string) => void;
  afterChange: (editor: InsertEditor) => void;
  safeUrl: (value: string) => boolean;
  escapeHTML: (value: string) => string;
  toast: (message: string) => void;
};

export function createEditorInsertController(dependencies: EditorInsertDependencies) {
  async function insert(kind: string) {
    if (kind === 'image') {
      dependencies.openImagePicker();
      return;
    }
    if (kind === 'code') {
      dependencies.insertHTML('<pre><code>在这里粘贴代码或配置</code></pre><p></p>');
      return;
    }
    if (kind === 'table') {
      const editor = dependencies.getEditor();
      if (!editor) {
        dependencies.toast('编辑器尚未就绪，请稍后再试');
        return;
      }
      if (!editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()) {
        dependencies.toast('请先点击正文中的插入位置，再添加表格');
        return;
      }
      editor.commands.focus();
      editor.commands.scrollIntoView();
      dependencies.afterChange(editor);
      return;
    }
    if (kind === 'rule') {
      dependencies.insertHTML('<hr><p></p>');
      return;
    }
    if (kind === 'callout') {
      dependencies.insertHTML('<div class="callout">📌 在这里填写提示内容</div><p></p>');
      return;
    }
    if (kind === 'details') {
      dependencies.insertHTML('<details><summary>点击展开</summary><div data-type="detailsContent"><p>在这里填写折叠内容</p></div></details><p></p>');
      return;
    }
    if (kind === 'link') {
      const editor = dependencies.getEditor();
      const editing = Boolean(editor?.isActive('link'));
      const current = editing ? String(editor?.getAttributes('link').href || '') : '';
      const url = await dependencies.prompt(editing ? '编辑链接地址' : '输入链接地址（https://...）', current, {
        title: editing ? '编辑链接' : '插入链接',
        inputLabel: '链接地址',
        confirmText: editing ? '保存' : '插入',
        maxLength: 2048
      });
      if (url === null) return;
      if (!dependencies.safeUrl(url)) {
        dependencies.toast('只支持安全的 http、https 等链接');
        return;
      }
      const safeURL = url.trim();
      const currentEditor = dependencies.getEditor();
      if (editing && currentEditor) {
        currentEditor.chain().focus().extendMarkRange('link').setMark('link', { href: safeURL }).run();
        dependencies.afterChange(currentEditor);
      } else if (currentEditor?.state.selection.from !== currentEditor?.state.selection.to) {
        dependencies.format('createLink', safeURL);
      } else {
        dependencies.insertHTML(`<a href="${dependencies.escapeHTML(safeURL)}" rel="noopener noreferrer" target="_blank">${dependencies.escapeHTML(safeURL)}</a>`);
      }
      return;
    }
    if (kind === 'emoji') {
      const symbol = await dependencies.prompt('输入表情或符号（例如：✅ ⚠️ 📌 → ✓）', '✅', {
        title: '插入表情与符号',
        inputLabel: '表情或符号',
        confirmText: '插入',
        maxLength: 40
      });
      if (symbol) dependencies.insertHTML(dependencies.escapeHTML(symbol));
    }
  }

  return { insert };
}
