type Dialog = {
  open: () => unknown;
  close: () => unknown;
};

type LegacyDialog = Dialog & {
  readInput: () => string;
  showError: (error: unknown) => void;
};

type Dependencies = {
  closeMenu: () => void;
  vueMounted: boolean;
  vueDialog: Dialog;
  legacyDialog: LegacyDialog | null;
  save: (name: string) => Promise<string>;
  onCreated: (name: string) => void;
};

export function createCategoryDialogController(dependencies: Dependencies) {
  function open(): void {
    dependencies.closeMenu();
    if (dependencies.vueMounted) dependencies.vueDialog.open();
    else dependencies.legacyDialog?.open();
  }

  function close(): void {
    if (dependencies.vueMounted) dependencies.vueDialog.close();
    else dependencies.legacyDialog?.close();
  }

  async function saveVue(name: string): Promise<void> {
    const saved = await dependencies.save(name);
    dependencies.onCreated(saved);
  }

  async function saveLegacy(): Promise<void> {
    const dialog = dependencies.legacyDialog;
    if (!dialog) return;

    try {
      const saved = await dependencies.save(dialog.readInput());
      dialog.close();
      dependencies.onCreated(saved);
    } catch (error) {
      dialog.showError(error);
    }
  }

  return { open, close, saveVue, saveLegacy };
}
