import type { VaultData } from '../../shared/api-contracts.js';
import { createLegacyCaptureDialog } from '../compat/capture/legacy-capture-dialog.ts';
import { createCaptureDialogController } from '../features/capture/capture-dialog-controller.ts';
import type { CaptureDialogPresenterOptions } from '../features/capture/capture-dialog-presenter.ts';
import { createCaptureDialogPresenter } from '../features/capture/capture-dialog-presenter.ts';
import { createCaptureFlow } from '../features/capture/capture-flow.ts';
import type { VaultMutationPort } from '../features/vault/mutation.ts';

type CaptureDialogStore = {
  bindSave: (handler: (input: { title: string; type: string; source: string; body: string }) => Promise<void>) => void;
  bindPasteHandler: (handler: (event: ClipboardEvent) => unknown) => void;
  open: (configuration: { types: Array<{ id: string; name: string }>; pasteMode: string; restoreFocusOnClose?: boolean }) => void;
  close: () => void;
};

type Dependencies = {
  document: Document;
  escapeHTML: (value: unknown) => string;
  getVault: () => VaultData;
  mutateVault: VaultMutationPort;
  cleanBody: (html: string) => string;
  bodyText: (html: string) => string;
  vueMounted: boolean;
  closeMenu: () => void;
  getTypes: () => Array<{ id: string; name: string }>;
  getPasteMode: () => string;
  vueDialog: CaptureDialogStore;
  openNote: (id: string) => void;
  notify: (message: string) => void;
};

/** Composes capture persistence and the Vue/legacy dialog adapters. */
export function createWorkspaceCaptureFeature(dependencies: Dependencies) {
  const flow = createCaptureFlow({
    getVault: dependencies.getVault,
    mutateVault: dependencies.mutateVault,
    cleanBody: dependencies.cleanBody,
    bodyText: dependencies.bodyText
  });
  const legacyDialog = dependencies.vueMounted
    ? null
    : createLegacyCaptureDialog({ document: dependencies.document, escapeHtml: dependencies.escapeHTML });
  const controller = createCaptureDialogController({
    save: input => flow.save(input),
    openNote: dependencies.openNote,
    legacyDialog,
    notify: dependencies.notify
  });
  const presenter = createCaptureDialogPresenter({
    closeMenu: dependencies.closeMenu,
    vueMounted: dependencies.vueMounted,
    getTypes: dependencies.getTypes,
    getPasteMode: dependencies.getPasteMode,
    vueDialog: dependencies.vueDialog,
    legacyDialog
  });

  if (dependencies.vueMounted) dependencies.vueDialog.bindSave(input => controller.saveVue(input));

  function open(options: CaptureDialogPresenterOptions = {}) {
    presenter.open(options);
  }

  function close() {
    presenter.close();
  }

  async function saveLegacy() {
    await controller.saveLegacy();
  }

  function bindPasteHandler(handler: (event: ClipboardEvent) => unknown) {
    if (dependencies.vueMounted) dependencies.vueDialog.bindPasteHandler(handler);
  }

  return { open, close, saveLegacy, bindPasteHandler };
}
