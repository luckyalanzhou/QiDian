export type CaptureDialogPresenterType = { id: string; name: string };

export type CaptureDialogPresenterOptions = { restoreFocusOnClose?: boolean };

type VueDialog = {
  open: (configuration: {
    types: CaptureDialogPresenterType[];
    categories: string[];
    pasteMode: string;
    restoreFocusOnClose?: boolean;
  }) => void;
  close: () => void;
};

type LegacyDialog = {
  open: (configuration: {
    types: CaptureDialogPresenterType[];
    defaultType: string;
    categoryOptions: string;
    pasteMode: string;
  }) => void;
  close: () => void;
};

type CaptureDialogPresenterDependencies = {
  closeMenu: () => void;
  vueMounted: boolean;
  getTypes: () => CaptureDialogPresenterType[];
  getCategories: () => string[];
  getPasteMode: () => string;
  getLegacyCategoryOptions: () => string;
  vueDialog: VueDialog;
  legacyDialog: LegacyDialog | null;
};

export function createCaptureDialogPresenter(dependencies: CaptureDialogPresenterDependencies) {
  function open(options: CaptureDialogPresenterOptions = {}): void {
    dependencies.closeMenu();
    const types = dependencies.getTypes();
    const pasteMode = dependencies.getPasteMode();

    if (dependencies.vueMounted) {
      dependencies.vueDialog.open({
        types,
        categories: dependencies.getCategories(),
        pasteMode,
        restoreFocusOnClose: options.restoreFocusOnClose,
      });
      return;
    }

    const defaultType = types.find(type => type.id === 'clip')?.id || types[0]?.id || 'note';
    dependencies.legacyDialog?.open({
      types,
      defaultType,
      categoryOptions: dependencies.getLegacyCategoryOptions(),
      pasteMode,
    });
  }

  function close(): void {
    if (dependencies.vueMounted) dependencies.vueDialog.close();
    else dependencies.legacyDialog?.close();
  }

  return { open, close };
}
