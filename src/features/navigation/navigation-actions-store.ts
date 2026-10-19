import { defineStore } from 'pinia';
import type { NavigationCommand, NavigationCommandResult } from './navigation-command.ts';

export type NavigationCommandExecutor = (command: NavigationCommand) => NavigationCommandResult;

export const useNavigationActionsStore = defineStore('navigation-actions', () => {
  let executor: NavigationCommandExecutor = () => false;

  function bind(next: NavigationCommandExecutor) {
    executor = next;
  }

  function execute(command: NavigationCommand): NavigationCommandResult {
    return executor(command);
  }

  return { bind, execute };
});
