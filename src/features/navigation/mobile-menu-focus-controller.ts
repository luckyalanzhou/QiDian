type Dependencies = {
  document: Document;
  isOpen: () => boolean;
  close: () => void;
  getSidebar: () => HTMLElement | null;
  getMenuButton: () => HTMLElement | null;
  getMain: () => HTMLElement | null;
  scheduleFocus: (callback: () => void) => unknown;
};

export function createMobileMenuFocusController(dependencies: Dependencies) {
  function close(returnToButton = false) {
    const wasOpen = dependencies.isOpen();
    const focusWasInSidebar = dependencies.getSidebar()?.contains(dependencies.document.activeElement) || false;
    dependencies.close();

    if (!wasOpen || (!returnToButton && !focusWasInSidebar)) return false;
    dependencies.scheduleFocus(() => {
      const target = returnToButton ? dependencies.getMenuButton() : dependencies.getMain();
      target?.focus({ preventScroll: true });
    });
    return true;
  }

  return { close };
}
