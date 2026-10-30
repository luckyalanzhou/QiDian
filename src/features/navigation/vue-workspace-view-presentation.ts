import type { WorkspacePage } from './transitions.ts';
import type { WorkspaceViewPresentation, WorkspaceViewState } from './workspace-view-contract.ts';

const pageLabels: Record<WorkspacePage, string> = {
  dashboard: '首页',
  home: '笔记',
  bookmarks: '书签',
  trash: '回收站',
  note: '阅读笔记'
};

type VuePresentationDependencies = {
  main: HTMLElement;
  getHost: () => HTMLElement | null;
  destroyRichEditor: () => void;
  prepareEditorPage: () => void;
};

export function createVueWorkspaceViewPresentation(
  dependencies: VuePresentationDependencies
): WorkspaceViewPresentation {
  function syncVisibility({ page, editing }: WorkspaceViewState) {
    dependencies.main.hidden = true;
    const host = dependencies.getHost();
    if (!host) return;
    host.hidden = false;
    host.setAttribute('aria-label', page === 'note' && editing ? '编辑笔记' : pageLabels[page]);
  }

  function render({ page, editing }: WorkspaceViewState) {
    if (page !== 'note') dependencies.destroyRichEditor();
    else if (editing) dependencies.prepareEditorPage();
  }

  return { syncVisibility, render };
}
