type Dependencies = {
  closeMobileDrawer?: () => boolean;
  scheduleFocus?: (callback: () => void) => void;
};

export function mountSkipToMainContent(document: Document, dependencies: Dependencies = {}) {
  const link = document.querySelector<HTMLAnchorElement>('#skipToMain');
  if (!link) return () => {};

  const focusMain = (event: MouseEvent) => {
    event.preventDefault();
    const main = document.querySelector<HTMLElement>('#dashboardHost:not([hidden]), #main:not([hidden])');
    const drawerOpen = document.querySelector('#sidebar[aria-modal="true"]');
    if (drawerOpen && dependencies.closeMobileDrawer?.()) {
      (dependencies.scheduleFocus ?? (callback => callback()))(() => main?.focus({ preventScroll: true }));
      return;
    }
    main?.focus();
  };

  link.addEventListener('click', focusMain);
  return () => link.removeEventListener('click', focusMain);
}
