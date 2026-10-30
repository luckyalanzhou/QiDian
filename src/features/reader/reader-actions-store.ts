import { defineStore } from 'pinia';
import type { ReaderActionCommand, ReaderActionResult } from './reader-action.ts';

export type ReaderActionExecutor = (command: ReaderActionCommand) => ReaderActionResult;

export const useReaderActionsStore = defineStore('reader-actions', () => {
  let executor: ReaderActionExecutor = () => undefined;

  function bind(next: ReaderActionExecutor) {
    executor = next;
  }

  function execute(command: ReaderActionCommand): ReaderActionResult {
    return executor(command);
  }

  return { bind, execute };
});
