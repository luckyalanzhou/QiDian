type EditorPageLifecycleDependencies<Factory, Editor> = {
  getFactory: () => Factory | null;
  loadFactory: () => Promise<Factory>;
  isActive: () => boolean;
  mount: () => Editor | null;
  focusTitle: () => void;
  onLoadError: (error: unknown) => void;
};

export function createEditorPageLifecycle<Factory, Editor>({
  getFactory,
  loadFactory,
  isActive,
  mount,
  focusTitle,
  onLoadError
}: EditorPageLifecycleDependencies<Factory, Editor>) {
  let pendingLoad: Promise<void> | null = null;

  function initialize(): Editor | null | Promise<void> {
    if (!isActive()) return null;
    if (getFactory()) return mount();
    if (pendingLoad) return pendingLoad;

    pendingLoad = loadFactory()
      .then(() => {
        if (!isActive()) return;
        mount();
        focusTitle();
      })
      .catch(error => {
        onLoadError(error);
      })
      .finally(() => {
        pendingLoad = null;
      });

    return pendingLoad;
  }

  return { initialize };
}
