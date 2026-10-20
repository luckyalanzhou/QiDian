type LegacyEditorPageDependencies<Factory> = {
  getFactory: () => Factory | null;
  setFactory: (factory: Factory) => void;
  loadFactory: () => Promise<Factory>;
  isActive: () => boolean;
  renderLoading: () => void;
  renderPage: () => void;
  focusTitle: () => void;
  renderFailure: () => void;
  onLoadError: (error: unknown) => void;
};

/** Owns the lazy editor-module loading state for the migration-only DOM page. */
export function createLegacyEditorPageController<Factory>({
  getFactory,
  setFactory,
  loadFactory,
  isActive,
  renderLoading,
  renderPage,
  focusTitle,
  renderFailure,
  onLoadError
}: LegacyEditorPageDependencies<Factory>) {
  let pendingLoad: Promise<void> | null = null;

  function render(): void | Promise<void> {
    if (getFactory()) return renderPage();
    if (pendingLoad) return pendingLoad;

    renderLoading();
    const load = Promise.resolve()
      .then(loadFactory)
      .then(factory => {
        setFactory(factory);
        if (!isActive()) return;
        renderPage();
        focusTitle();
      })
      .catch(error => {
        renderFailure();
        onLoadError(error);
      })
      .finally(() => {
        if (pendingLoad === load) pendingLoad = null;
      });

    pendingLoad = load;
    return load;
  }

  return { render };
}
