import type { NoteType, VaultNote } from '../../../shared/api-contracts.d.ts';
import type { EditorSession } from './types';

export type EditorSessionSnapshotInput = {
  note: VaultNote;
  noteTypes: readonly NoteType[];
  categories: readonly string[];
  pasteMode: string;
};

export type EditorSessionSnapshotDependencies = {
  displayTypeName: (type: NoteType) => string;
  isDraft: (note: VaultNote) => boolean;
};

export function normalizeEditorPasteMode(value: unknown): string {
  return ['rich', 'match', 'markdown', 'plain'].includes(String(value)) ? String(value) : 'rich';
}

export function createEditorSessionSnapshot(dependencies: EditorSessionSnapshotDependencies) {
  return ({ note, noteTypes, categories, pasteMode }: EditorSessionSnapshotInput): Omit<EditorSession, 'revision'> => ({
    noteId: note.id,
    title: note.title || '',
    type: note.type,
    category: note.category || '未分类',
    tags: (note.tags || []).join(', '),
    source: note.source || '',
    noteTypes: noteTypes.map(type => ({ id: type.id, label: dependencies.displayTypeName(type) })),
    categories: [...categories],
    publishLabel: dependencies.isDraft(note) ? '发布笔记' : '保存笔记',
    pasteMode: normalizeEditorPasteMode(pasteMode)
  });
}
