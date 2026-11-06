import { createWorkspaceEditorInputFeature } from './workspace-editor-input.ts';
import { createWorkspaceEditorDraftFeature } from './workspace-editor-drafts.ts';
import { createWorkspaceNotePublishing } from './workspace-note-publishing.ts';
import { createWorkspaceEditorRuntime } from './workspace-editor-runtime.ts';
import { createWorkspaceEditorToolbar } from './workspace-editor-toolbar.ts';
import type { useNavigationStore } from '../features/navigation/store.ts';

type DraftDependencies = Omit<Parameters<typeof createWorkspaceEditorDraftFeature>[0], 'resetPendingPublish'>;
type PublishingFlowDependencies = Parameters<typeof createWorkspaceNotePublishing>[0];
type PublishCandidate = Parameters<PublishingFlowDependencies['complete']>[0];
type PublishingDependencies = Omit<PublishingFlowDependencies, 'prepareEditor' | 'saveDraft' | 'complete'> & {
  completion: {
    replaceVault: (candidate: PublishCandidate) => void;
    navigationStore: Pick<ReturnType<typeof useNavigationStore>, 'editing' | 'previewing' | 'editingDraft'>;
    destroyEditor: () => void;
    render: () => void;
    scrollToTop: () => void;
  };
};

/** Owns the shared draft/autosave and publication lifecycle callbacks. */
export function createWorkspaceEditorLifecycle(dependencies: {
  drafts: DraftDependencies;
  publishing: PublishingDependencies;
}) {
  let publishing: ReturnType<typeof createWorkspaceNotePublishing>;
  const { draftController, autosave } = createWorkspaceEditorDraftFeature({
    ...dependencies.drafts,
    resetPendingPublish: () => publishing.resetPending()
  });

  const { completion, ...publishingDependencies } = dependencies.publishing;
  publishing = createWorkspaceNotePublishing({
    ...publishingDependencies,
    prepareEditor: () => {
      autosave.clear();
      draftController.updateFromEditor();
    },
    saveDraft: () => draftController.saveDraft(true),
    complete: candidate => {
      completion.replaceVault(candidate);
      completion.navigationStore.editing = false;
      completion.navigationStore.previewing = false;
      completion.navigationStore.editingDraft = null;
      completion.destroyEditor();
      completion.render();
      completion.scrollToTop();
    }
  });

  return { draftController, autosave, publishing };
}

type ToolbarDependencies = Omit<Parameters<typeof createWorkspaceEditorToolbar>[0], 'insert' | 'closeSlashMenu'>;
type InputDependencies = Omit<Parameters<typeof createWorkspaceEditorInputFeature>[0], 'editorInsert'> & {
  editorInsert: Omit<Parameters<typeof createWorkspaceEditorInputFeature>[0]['editorInsert'], 'format' | 'afterChange'>;
};
type RuntimeDependencies = Omit<
  Parameters<typeof createWorkspaceEditorRuntime>[0],
  'afterEditorChange' | 'handlePaste' | 'openSlashMenu' | 'syncToolbarState' | 'organizeEditorTools' | 'insert'
>;
type EditorChangeTarget =
  | Parameters<Parameters<typeof createWorkspaceEditorInputFeature>[0]['editorInsert']['afterChange']>[0]
  | Parameters<Parameters<typeof createWorkspaceEditorRuntime>[0]['syncToolbarState']>[0];

type WorkspaceEditorFeatureDependencies = {
  toolbar: ToolbarDependencies;
  input: InputDependencies;
  runtime: RuntimeDependencies;
  createRuntime: typeof createWorkspaceEditorRuntime;
};

/** Composes the editor toolbar, input adapters, and runtime around their shared commands. */
export function createWorkspaceEditorFeature(dependencies: WorkspaceEditorFeatureDependencies) {
  const toolbar = createWorkspaceEditorToolbar({
    ...dependencies.toolbar,
    closeSlashMenu: () => input.closeSlashMenu(),
    insert: kind => input.insert(kind)
  });

  let runtime: ReturnType<typeof createWorkspaceEditorRuntime> | null = null;
  const inputDependencies = dependencies.input;
  const afterEditorChange = (editor: EditorChangeTarget) => {
    dependencies.runtime.updateDraftFromDOM();
    dependencies.runtime.scheduleSave();
    toolbar.sync(editor as Parameters<typeof toolbar.sync>[0]);
    runtime?.refreshOutline(editor as Parameters<NonNullable<typeof runtime>['refreshOutline']>[0]);
  };
  const input = createWorkspaceEditorInputFeature({
    ...inputDependencies,
    editorInsert: {
      ...inputDependencies.editorInsert,
      format: (command, value) => toolbar.doFormat(command, value),
      afterChange: afterEditorChange
    }
  });

  runtime = dependencies.createRuntime({
    ...dependencies.runtime,
    afterEditorChange,
    handlePaste: input.handleEditorPaste,
    openSlashMenu: input.openSlashMenu,
    syncToolbarState: toolbar.sync,
    organizeEditorTools: toolbar.organize,
    insert: kind => input.insert(kind)
  });
  runtime.bindRuntime();

  return { toolbar, input, runtime };
}
