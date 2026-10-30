import { nextTick, watch } from 'vue';

function canRestoreFocus(target: HTMLElement | null): target is HTMLElement {
  if (!target?.isConnected || ('disabled' in target && target.disabled) || target.getAttribute('aria-disabled') === 'true') return false;
  if (!target.matches('button, input, select, textarea, a[href], summary, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]')) return false;

  let current: HTMLElement | null = target;
  const view = target.ownerDocument.defaultView;
  while (current) {
    if (current.hidden || current.hasAttribute('inert') || current.getAttribute('aria-hidden') === 'true' || current.classList.contains('visually-hidden')) return false;
    if (current.tagName === 'DETAILS' && !(current as HTMLDetailsElement).open && target.tagName !== 'SUMMARY') return false;
    if (current.classList.contains('overlay') && !current.classList.contains('open')) return false;
    const style = view?.getComputedStyle(current);
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.contentVisibility === 'hidden')) return false;
    current = current.parentElement;
  }

  return true;
}

export function firstRestorableFocusTarget(targets: Iterable<HTMLElement>) {
  return [...targets].find(canRestoreFocus) || null;
}

export function watchDialogFocusReturn(
  isOpen: () => boolean,
  getFallback: () => HTMLElement | null,
  options: { preferFallback?: boolean } = {}
) {
  let opener: HTMLElement | null = null;
  let openerOverlay: HTMLElement | null = null;
  let transition = 0;

  watch(isOpen, async open => {
    const currentTransition = ++transition;
    if (open) {
      const active = document.activeElement;
      opener = active instanceof HTMLElement ? active : null;
      openerOverlay = [...document.querySelectorAll<HTMLElement>('.overlay.open')].at(-1) || null;
      return;
    }

    await nextTick();
    if (currentTransition !== transition || isOpen()) return;
    const newerOverlayOpen = [...document.querySelectorAll<HTMLElement>('.overlay.open')]
      .some(overlay => overlay !== openerOverlay);
    if (newerOverlayOpen) {
      opener = null;
      openerOverlay = null;
      return;
    }

    const target = !options.preferFallback && canRestoreFocus(opener) ? opener : null;
    opener = null;
    openerOverlay = null;
    if (canRestoreFocus(target)) {
      target.focus({ preventScroll: true });
      if (document.activeElement === target) return;
    }

    const fallback = getFallback();
    if (canRestoreFocus(fallback)) fallback.focus({ preventScroll: true });
  });
}
