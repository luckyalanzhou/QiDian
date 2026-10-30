import { firstRestorableFocusTarget } from '../dialogs/dialog-focus-return.ts';

const FOCUSABLE_SELECTOR = 'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[contenteditable="true"],[tabindex]:not([tabindex="-1"])';

export function createAuthRecoveryModal(document: Document, host: HTMLElement, background: HTMLElement | null) {
  let active = false;
  let opener: HTMLElement | null = null;
  let backgroundWasInert = false;
  let previousRole: string | null = null;
  let previousModal: string | null = null;
  let hadReauthClass = false;

  function activate() {
    if (!active) {
      const element = document.activeElement;
      const HTMLElementType = document.defaultView?.HTMLElement;
      opener = HTMLElementType && element instanceof HTMLElementType ? element : null;
      backgroundWasInert = background?.hasAttribute('inert') ?? false;
      previousRole = host.getAttribute('role');
      previousModal = host.getAttribute('aria-modal');
      hadReauthClass = host.classList.contains('reauth');
      active = true;
    }

    if (background) background.setAttribute('inert', '');
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.classList.add('reauth');
    host.hidden = false;
  }

  function focus() {
    if (!active) return;
    const mfaCode = host.querySelector<HTMLElement>('#authMfaCode');
    const username = host.querySelector<HTMLInputElement>('#authUsername');
    const password = host.querySelector<HTMLElement>('#authPassword');
    const target = mfaCode ?? (username?.value.trim() ? password ?? username : username) ?? host.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    target?.focus({ preventScroll: true });
  }

  function deactivate() {
    if (!active) return;
    host.hidden = true;
    host.classList.toggle('reauth', hadReauthClass);
    if (previousRole === null) host.removeAttribute('role');
    else host.setAttribute('role', previousRole);
    if (previousModal === null) host.removeAttribute('aria-modal');
    else host.setAttribute('aria-modal', previousModal);

    if (background) {
      if (backgroundWasInert) background.setAttribute('inert', '');
      else background.removeAttribute('inert');
    }

    const candidates = [opener, ...(background?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])]
      .filter((element): element is HTMLElement => element !== null);
    const target = backgroundWasInert ? null : firstRestorableFocusTarget(candidates);
    target?.focus({ preventScroll: true });
    active = false;
    opener = null;
  }

  return { activate, focus, deactivate };
}
