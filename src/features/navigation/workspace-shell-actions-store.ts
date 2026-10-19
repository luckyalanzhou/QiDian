import { defineStore } from 'pinia';
import type { WorkspaceShellCommand, WorkspaceShellCommandResult } from './workspace-shell-command.ts';

export type WorkspaceShellCommandExecutor = (command: WorkspaceShellCommand) => WorkspaceShellCommandResult;

export const useWorkspaceShellActionsStore = defineStore('workspace-shell-actions', () => {
  let executor: WorkspaceShellCommandExecutor = () => false;

  function bind(next: WorkspaceShellCommandExecutor) {
    executor = next;
  }

  function execute(command: WorkspaceShellCommand): WorkspaceShellCommandResult {
    return executor(command);
  }

  return { bind, execute };
});
