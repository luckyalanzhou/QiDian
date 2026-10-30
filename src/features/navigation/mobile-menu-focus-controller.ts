type Dependencies = {
  document: Document;
  isOpen: () => boolean;
  close: () => void;
  getSidebar: () => HTMLElement | null;
  getMenuButton: () => HTMLElement | null;
  getMain: () => HTMLElement | null;
  scheduleFocus: (callback: () => void) => unknown;
};

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[tabindex]',
  '[contenteditable="true"]'
].join(',');

export function createMobileMenuFocusController(dependencies: Dependencies) {
  function getFocusableElements() {
    const sidebar = dependencies.getSidebar();
    if (!sidebar) return [];

    return Array.from(sidebar.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(element => {
      if (element.tabIndex < 0 || element.matches(':disabled') || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      const style = dependencies.document.defaultView?.getComputedStyle(element);
      return style?.display !== 'none' && style?.visibility !== 'hidden' && element.getClientRects().length > 0;
    });
  }

  function focusInitial() {
    dependencies.scheduleFocus(() => {
      if (!dependencies.isOpen()) return;
      const sidebar = dependencies.getSidebar();
      const activeNavigation = sidebar?.querySelector<HTMLElement>('.side-link.active');
      const target = activeNavigation && getFocusableElements().includes(activeNavigation)
        ? activeNavigation
        : getFocusableElements()[0] ?? dependencies.getMenuButton();
      target?.focus({ preventScroll: true });
    });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!dependencies.isOpen() || event.key !== 'Tab' || event.defaultPrevented) return;
    const elements = getFocusableElements();
    if (!elements.length) return;

    const activeIndex = elements.indexOf(dependencies.document.activeElement as HTMLElement);
    if (event.shiftKey && activeIndex <= 0) {
      event.preventDefault();
      elements[elements.length - 1].focus({ preventScroll: true });
    } else if (!event.shiftKey && (activeIndex < 0 || activeIndex === elements.length - 1)) {
      event.preventDefault();
      elements[0].focus({ preventScroll: true });
    }
  }

  function attach() {
    dependencies.document.addEventListener('keydown', handleKeydown, true);
    return () => dependencies.document.removeEventListener('keydown', handleKeydown, true);
  }

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

  return { attach, close, focusInitial };
}
