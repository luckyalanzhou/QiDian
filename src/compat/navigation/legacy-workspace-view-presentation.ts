import type { WorkspaceViewPresentation, WorkspaceViewState } from '../../features/navigation/workspace-view-contract.ts';

type LegacyPresentationDependencies = {
  main: HTMLElement;
  getVueHost: () => HTMLElement | null;
  destroyRichEditor: () => void;
  setBreadcrumb: (title: string) => void;
  renderBookmarks: () => void;
  renderTrash: () => void;
  renderDashboard: () => void;
  renderHome: () => void;
  renderEditor: () => void;
  renderReader: () => void;
};

export function createLegacyWorkspaceViewPresentation(
  dependencies: LegacyPresentationDependencies
): WorkspaceViewPresentation {
  function syncVisibility() {
    dependencies.main.hidden = false;
    const host = dependencies.getVueHost();
    if (host) host.hidden = true;
  }

  function render({ page, editing }: WorkspaceViewState) {
    switch (page) {
      case 'bookmarks':
        dependencies.destroyRichEditor();
        dependencies.setBreadcrumb('书签导航');
        dependencies.renderBookmarks();
        break;
      case 'trash':
        dependencies.destroyRichEditor();
        dependencies.setBreadcrumb('回收站');
        dependencies.renderTrash();
        break;
      case 'dashboard':
        dependencies.renderDashboard();
        break;
      case 'home':
        dependencies.renderHome();
        break;
      case 'note':
        if (editing) dependencies.renderEditor();
        else dependencies.renderReader();
        break;
    }
  }

  return { syncVisibility, render };
}
