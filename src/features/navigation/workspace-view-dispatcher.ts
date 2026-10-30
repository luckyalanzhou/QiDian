import type { WorkspaceViewPresentation, WorkspaceViewState } from './workspace-view-contract.ts';
import type { WorkspacePage } from './transitions.ts';

export type WorkspaceViewDispatcherDependencies = {
  getState: () => WorkspaceViewState;
  presentation: WorkspaceViewPresentation;
  pruneExpiredTrash: () => unknown;
  leaveBookmarks: () => void;
  disconnectReaderHeadingObserver: () => void;
  renderSidebar: () => void;
};

export function createWorkspaceViewDispatcher(dependencies: WorkspaceViewDispatcherDependencies) {
  let lastRenderedPage: WorkspacePage | '' = '';

  function render() {
    dependencies.pruneExpiredTrash();

    const { page, editing } = dependencies.getState();
    if (lastRenderedPage === 'bookmarks' && page !== 'bookmarks') {
      dependencies.leaveBookmarks();
    }
    lastRenderedPage = page;
    dependencies.disconnectReaderHeadingObserver();

    const state = { page, editing };
    dependencies.presentation.syncVisibility(state);
    dependencies.renderSidebar();
    dependencies.presentation.render(state);
  }

  return { render };
}
