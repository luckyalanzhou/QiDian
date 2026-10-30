const FOCUSABLE_SELECTOR = ':is(button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[contenteditable="true"],[tabindex]:not([tabindex="-1"]))';

export function mountModalFocusLoop(document: Document) {
  function keepFocusInsideTopDialog(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;

    const overlays = document.querySelectorAll<HTMLElement>('.overlay.open');
    const recoveryDialog = document.querySelector<HTMLElement>('#loginGate.reauth[role="dialog"][aria-modal="true"]');
    const overlay = recoveryDialog ?? overlays.item(overlays.length - 1);
    if (!overlay) return;

    const fields = [...overlay.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
      .filter(field => !field.closest('[hidden], [inert], [aria-hidden="true"]'));
    if (!fields.length) return;

    const first = fields[0];
    const last = fields.at(-1)!;
    const activeIndex = fields.indexOf(document.activeElement as HTMLElement);
    if (activeIndex < 0) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && activeIndex === 0) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && activeIndex === fields.length - 1) {
      event.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('keydown', keepFocusInsideTopDialog);
  return () => document.removeEventListener('keydown', keepFocusInsideTopDialog);
}
