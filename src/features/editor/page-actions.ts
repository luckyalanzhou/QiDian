import type { VaultNote } from '../../../shared/api-contracts.js';
import type { EditorPageActionCommand, EditorPageActionResult } from './editor-page-action.ts';

type EditorPageActionDependencies = {
  saveCurrent: () => EditorPageActionResult;
  chooseAttachment: () => void;
  chooseImage: () => void;
  deleteCurrent: () => EditorPageActionResult;
  isEditing: () => boolean;
  isPreviewing: () => boolean;
  saveDraft: (quiet?: boolean) => unknown;
  getCurrentNote: () => VaultNote | undefined;
  isDraft: (note: VaultNote | undefined) => boolean;
  publishedView: (note: VaultNote) => VaultNote;
  cleanHTML: (html: string, includeEditorContent?: boolean) => string;
  exportHTML: (note: VaultNote, body: string) => Promise<unknown>;
  notify: (message: string) => void;
};

export function createEditorPageActions(dependencies: EditorPageActionDependencies) {
  function exportHtml(): void {
    if (dependencies.isEditing()) dependencies.saveDraft(true);
    const stored = dependencies.getCurrentNote();
    if (!stored) return;
    const note = dependencies.isEditing() || dependencies.isPreviewing() || dependencies.isDraft(stored)
      ? stored
      : dependencies.publishedView(stored);
    dependencies.exportHTML(note, dependencies.cleanHTML(note.body, true))
      .catch(error => dependencies.notify(`导出失败：${error instanceof Error ? error.message : String(error)}`));
  }

  function execute(command: EditorPageActionCommand): EditorPageActionResult {
    switch (command.type) {
      case 'save-current': return dependencies.saveCurrent();
      case 'choose-attachment': return dependencies.chooseAttachment();
      case 'export-html': return exportHtml();
      case 'choose-image': return dependencies.chooseImage();
      case 'delete-current': return dependencies.deleteCurrent();
    }
  }

  return {
    execute,
    saveCurrent: () => execute({ type: 'save-current' }),
    chooseAttachment: () => execute({ type: 'choose-attachment' }),
    exportHtml: () => execute({ type: 'export-html' }),
    chooseImage: () => execute({ type: 'choose-image' }),
    deleteCurrent: () => execute({ type: 'delete-current' })
  };
}
