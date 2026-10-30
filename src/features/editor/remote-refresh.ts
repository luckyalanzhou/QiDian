type RemoteEditorNote = {
  id: string;
  title?: string;
  type?: string;
  category?: string;
  tags?: string[];
  source?: string;
  body?: string;
  [key: string]: unknown;
};

type RemoteEditor = {
  getHTML: () => string;
  state: { selection: { from: number }; doc: { content: { size: number } } };
  commands: {
    setContent: (html: string, options: { emitUpdate: false }) => void;
    setTextSelection: (position: number) => void;
  };
};

type RemoteEditorRefreshDependencies = {
  document: Document;
  getEditingDraft: () => RemoteEditorNote | null;
  getBaseline: () => string | null;
  setEditingDraft: (note: RemoteEditorNote) => void;
  setBaseline: (snapshot: unknown) => void;
  snapshot: (note: RemoteEditorNote) => unknown;
  cleanBody: (body: string) => string;
  getEditor: () => RemoteEditor | null;
  syncToolbarState: (editor: RemoteEditor) => void;
  onConflict: (conflict: { base: RemoteEditorNote; local: RemoteEditorNote; remote: RemoteEditorNote }) => void;
};

export function createRemoteEditorRefresh(dependencies: RemoteEditorRefreshDependencies) {
  function refresh(note: RemoteEditorNote, preserveLocalChanges: boolean) {
    const localDraft = preserveLocalChanges ? dependencies.getEditingDraft() : null;
    let nextDraft = structuredClone(note);
    let baseline: Partial<RemoteEditorNote> | null = null;
    let conflicting = false;
    if (localDraft) {
      try {
        const value: unknown = JSON.parse(dependencies.getBaseline() || 'null');
        if (value && typeof value === 'object' && !Array.isArray(value)) baseline = value as Partial<RemoteEditorNote>;
      } catch {}

      const fields: (keyof RemoteEditorNote)[] = ['title', 'type', 'category', 'tags', 'source', 'body'];
      conflicting = fields.some(field => {
        const localValue = localDraft[field];
        const baselineValue = baseline?.[field];
        const remoteValue = note[field];
        if (baseline) {
          return JSON.stringify(localValue) !== JSON.stringify(baselineValue)
            && JSON.stringify(remoteValue) !== JSON.stringify(baselineValue)
            && JSON.stringify(localValue) !== JSON.stringify(remoteValue);
        }
        return JSON.stringify(localValue) !== JSON.stringify(remoteValue);
      });
      for (const field of fields) {
        const localValue = localDraft[field];
        const baselineValue = baseline?.[field];
        if (!baseline || JSON.stringify(localValue) !== JSON.stringify(baselineValue)) {
          if (localValue !== undefined) nextDraft[field] = structuredClone(localValue);
        }
      }
      if (conflicting) {
        dependencies.onConflict({
          base: { ...note, ...(baseline || {}) },
          local: nextDraft,
          remote: note
        });
      }
    }

    dependencies.setEditingDraft(nextDraft);
    if (!conflicting) dependencies.setBaseline(dependencies.snapshot(note));

    const fields: [string, string][] = [
      ['editTitle', nextDraft.title || ''],
      ['editType', nextDraft.type || 'note'],
      ['editTags', (nextDraft.tags || []).join(', ')],
      ['editSource', nextDraft.source || '']
    ];
    for (const [id, value] of fields) {
      const field = dependencies.document.getElementById(id) as HTMLInputElement | null;
      if (field) field.value = value;
    }

    const category = dependencies.document.getElementById('editCategory') as HTMLInputElement | null;
    if (category) category.value = nextDraft.category || '未分类';

    const editor = dependencies.getEditor();
    const html = dependencies.cleanBody(nextDraft.body || '');
    if (editor && editor.getHTML() !== html) {
      const selection = editor.state.selection.from;
      editor.commands.setContent(html, { emitUpdate: false });
      editor.commands.setTextSelection(Math.max(1, Math.min(selection, editor.state.doc.content.size - 1)));
      dependencies.syncToolbarState(editor);
    }
  }

  return { refresh };
}
