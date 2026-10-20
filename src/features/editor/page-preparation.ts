type EditorSessionOptions<NoteType> = {
  noteTypes: NoteType[];
  categories: string[];
};

type EditorSessionInput<Note, NoteType> = EditorSessionOptions<NoteType> & {
  note: Note;
  pasteMode: string;
};

type EditorPagePreparationDependencies<Note, NoteType, Session> = {
  destroyEditor: () => void;
  ensureDraft: () => Note;
  getOptions: () => EditorSessionOptions<NoteType>;
  getPasteMode: () => string;
  createSession: (input: EditorSessionInput<Note, NoteType>) => Session;
  sync: (session: Session) => void;
};

/** Prepares the feature session before Vue renders the editor page. */
export function createEditorPagePreparation<Note, NoteType, Session>({
  destroyEditor,
  ensureDraft,
  getOptions,
  getPasteMode,
  createSession,
  sync
}: EditorPagePreparationDependencies<Note, NoteType, Session>) {
  function prepare() {
    destroyEditor();
    const note = ensureDraft();
    const { noteTypes, categories } = getOptions();
    const session = createSession({ note, noteTypes, categories, pasteMode: getPasteMode() });
    sync(session);
  }

  return { prepare };
}
