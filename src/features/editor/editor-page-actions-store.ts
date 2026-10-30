import { defineStore } from 'pinia';
import type { EditorPageActionCommand, EditorPageActionResult } from './editor-page-action.ts';

export type EditorPageActionExecutor = (command: EditorPageActionCommand) => EditorPageActionResult;

export const useEditorPageActionsStore = defineStore('editor-page-actions', () => {
  let executor: EditorPageActionExecutor = () => undefined;

  function bind(next: EditorPageActionExecutor) {
    executor = next;
  }

  function execute(command: EditorPageActionCommand): EditorPageActionResult {
    return executor(command);
  }

  return { bind, execute };
});
