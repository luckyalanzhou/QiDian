import type { CaptureInput } from './capture-flow.ts';

type LegacyDialog = {
  readInput: () => CaptureInput;
  close: () => void;
};

type Dependencies = {
  save: (input: CaptureInput) => Promise<{ id: string }>;
  openNote: (id: string) => void;
  legacyDialog: LegacyDialog | null;
  notify: (message: string) => void;
};

export function createCaptureDialogController(dependencies: Dependencies) {
  async function saveVue(input: CaptureInput): Promise<void> {
    const note = await dependencies.save(input);
    dependencies.openNote(note.id);
  }

  async function saveLegacy(): Promise<void> {
    const dialog = dependencies.legacyDialog;
    if (!dialog) return;

    try {
      const note = await dependencies.save(dialog.readInput());
      dialog.close();
      dependencies.openNote(note.id);
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error
        ? String(error.message || '')
        : '';
      dependencies.notify(message || '网页摘录尚未保存');
    }
  }

  return { saveVue, saveLegacy };
}
