import type { WorkspacePage } from './transitions.ts';

export type WorkspaceViewState = { page: WorkspacePage; editing: boolean };

export type WorkspaceViewDispatcherDependencies = {
  getState: () => WorkspaceViewState;
  vueMounted: boolean;
  main: HTMLElement;
  getVueHost: () => HTMLElement | null;
  getLastRenderedPage: () => WorkspacePage | '';
  setLastRenderedPage: (page: WorkspacePage) => void;
  pruneExpiredTrash: () => unknown;
  leaveBookmarks: () => void;
  disconnectReaderHeadingObserver: () => void;
  renderSidebar: () => void;
  destroyRichEditor: () => void;
  setBreadcrumb: (title: string) => void;
  prepareVueEditorPage: () => void;
  renderLegacyBookmarks: () => void;
  renderLegacyTrash: () => void;
  renderLegacyDashboard: () => void;
  renderLegacyHome: () => void;
  renderLegacyEditor: () => void;
  renderLegacyReader: () => void;
};

const pageLabels: Record<WorkspacePage, string> = {
  dashboard: '首页',
  home: '笔记',
  bookmarks: '书签',
  trash: '回收站',
  note: '阅读笔记'
};

export function createWorkspaceViewDispatcher(dependencies: WorkspaceViewDispatcherDependencies) {
  function render() {
    dependencies.pruneExpiredTrash();

    const { page, editing } = dependencies.getState();
    if (dependencies.getLastRenderedPage() === 'bookmarks' && page !== 'bookmarks') {
      dependencies.leaveBookmarks();
    }
    dependencies.setLastRenderedPage(page);
    dependencies.disconnectReaderHeadingObserver();

    const hasVuePage = dependencies.vueMounted;
    const host = dependencies.getVueHost();
    dependencies.main.hidden = hasVuePage;
    if (host) {
      host.hidden = !hasVuePage;
      if (hasVuePage) {
        host.setAttribute('aria-label', page === 'note' && editing ? '编辑笔记' : pageLabels[page]);
      }
    }

    dependencies.renderSidebar();

    if (hasVuePage) {
      switch (page) {
        case 'dashboard':
          dependencies.destroyRichEditor();
          break;
        case 'home':
          dependencies.destroyRichEditor();
          break;
        case 'bookmarks':
          dependencies.destroyRichEditor();
          break;
        case 'trash':
          dependencies.destroyRichEditor();
          break;
        case 'note':
          if (editing) dependencies.prepareVueEditorPage();
          break;
      }
      return;
    }

    switch (page) {
      case 'bookmarks':
        dependencies.destroyRichEditor();
        dependencies.setBreadcrumb('书签导航');
        dependencies.renderLegacyBookmarks();
        break;
      case 'trash':
        dependencies.destroyRichEditor();
        dependencies.setBreadcrumb('回收站');
        dependencies.renderLegacyTrash();
        break;
      case 'dashboard':
        dependencies.renderLegacyDashboard();
        break;
      case 'home':
        dependencies.renderLegacyHome();
        break;
      case 'note':
        if (editing) dependencies.renderLegacyEditor();
        else dependencies.renderLegacyReader();
        break;
    }
  }

  return { render };
}
