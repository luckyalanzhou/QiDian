export type WorkspaceSessionInitial = {
  local?: boolean;
  restoreDraft?: boolean;
  restoreConflict?: boolean;
};

export type WorkspaceSessionOptions<Vault> = {
  initial: WorkspaceSessionInitial;
  theme: string;
  currentVersion: string;
  vault: Vault;
  applyTheme: (theme: string) => void;
  render: () => void;
  renderVersionBadge: (state: { currentVersion: string; updateAvailable: false }) => void;
  checkUpdates: () => unknown;
  queueSave: (vault: Vault) => unknown;
  dispose: ReadonlyArray<() => void>;
};

export function mountWorkspaceSession<Vault>(options: WorkspaceSessionOptions<Vault>) {
  let active = true;
  const dispose = () => {
    if (!active) return;
    active = false;
    let firstError: unknown;
    for (const cleanup of options.dispose) {
      try {
        cleanup();
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
  };

  try {
    options.applyTheme(options.theme);
    options.render();
    options.renderVersionBadge({ currentVersion: options.currentVersion, updateAvailable: false });
    if (!options.initial.local) void options.checkUpdates();
    if (options.initial.restoreDraft && !options.initial.restoreConflict) void options.queueSave(options.vault);
  } catch (error) {
    try {
      dispose();
    } catch {
      // Preserve the startup failure while still attempting every cleanup.
    }
    throw error;
  }

  return dispose;
}
