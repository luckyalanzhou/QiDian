import { createAttachmentUploadFlow } from '../features/editor/attachment-upload.ts';
import { createContentInsertionController } from '../features/editor/content-insertion.ts';
import { createEditorHtmlInserter } from '../features/editor/html-inserter.ts';
import { createEditorInsertController } from '../features/editor/insert-controller.ts';
import { createSlashMenuController } from '../features/editor/slash-menu-controller.ts';

type EditorInputDependencies = {
  htmlInserter: Parameters<typeof createEditorHtmlInserter>[0];
  editorInsert: Omit<Parameters<typeof createEditorInsertController>[0], 'insertHTML'>;
  contentInsertion: Omit<Parameters<typeof createContentInsertionController>[0], 'insertEditorHTML'>;
  attachmentUpload: Omit<Parameters<typeof createAttachmentUploadFlow>[0], 'insertHTML'>;
  slashMenu: Parameters<typeof createSlashMenuController>[0];
};

export function createWorkspaceEditorInputFeature(dependencies: EditorInputDependencies) {
  const htmlInserter = createEditorHtmlInserter(dependencies.htmlInserter);
  const insertHTML = (html: string) => htmlInserter.insert(html);
  const editorInsertController = createEditorInsertController({ ...dependencies.editorInsert, insertHTML });
  const contentInsertion = createContentInsertionController({ ...dependencies.contentInsertion, insertEditorHTML: insertHTML });
  const attachmentUpload = createAttachmentUploadFlow({ ...dependencies.attachmentUpload, insertHTML });
  const slashMenuController = createSlashMenuController(dependencies.slashMenu);

  return {
    insertHTML,
    insert: (kind: string) => editorInsertController.insert(kind),
    handleEditorPaste: (payload: Parameters<typeof contentInsertion.handleEditorPaste>[0]) => contentInsertion.handleEditorPaste(payload),
    handleCapturePaste: (event: Parameters<typeof contentInsertion.handleCapturePaste>[0]) => contentInsertion.handleCapturePaste(event),
    storeImage: (...args: Parameters<typeof contentInsertion.storeImage>) => contentInsertion.storeImage(...args),
    insertAttachments: (files: Parameters<typeof attachmentUpload.insertFiles>[0]) => attachmentUpload.insertFiles(files),
    openSlashMenu: () => slashMenuController.open(),
    closeSlashMenu: () => slashMenuController.close()
  };
}
