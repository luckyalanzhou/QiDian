export type EditorAutosaveDependencies = {
  isEditing: () => boolean;
  hasEditingDraft: () => boolean;
  saveDraft: () => unknown;
  setTimer?: (callback: () => void, delay: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  delay?: number;
};

/** Owns the editor's debounced save timer and explicit flush boundary. */
export function createEditorAutosaveController(dependencies: EditorAutosaveDependencies) {
  const setTimer = dependencies.setTimer || ((callback: () => void, delay: number) => globalThis.setTimeout(callback, delay));
  const clearTimer = dependencies.clearTimer || (handle => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>));
  const delay = dependencies.delay ?? 250;
  let timer: unknown = null;

  function clear() {
    if (timer === null) return;
    clearTimer(timer);
    timer = null;
  }

  function schedule() {
    clear();
    timer = setTimer(() => {
      timer = null;
      dependencies.saveDraft();
    }, delay);
  }

  function flush() {
    if (!dependencies.isEditing() || !dependencies.hasEditingDraft() || timer === null) return false;
    clear();
    return dependencies.saveDraft();
  }

  return { clear, schedule, flush, isScheduled: () => timer !== null };
}
