import type { WorkspacePage } from './transitions.ts';

export type WorkspaceViewState = { page: WorkspacePage; editing: boolean };

export type WorkspaceViewPresentation = {
  syncVisibility: (state: WorkspaceViewState) => void;
  render: (state: WorkspaceViewState) => void;
};
