import { createNotePublishFlow } from '../features/editor/note-publish-flow.ts';

type Dependencies = Parameters<typeof createNotePublishFlow>[0];

/** Composes note publication with the workspace's editor and persistence adapters. */
export function createWorkspaceNotePublishing(dependencies: Dependencies) {
  const flow = createNotePublishFlow(dependencies);

  return {
    publish: flow.publish,
    resetPending: flow.resetPending
  };
}
