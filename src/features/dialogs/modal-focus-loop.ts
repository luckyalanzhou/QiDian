const FOCUSABLE_SELECTOR = 'button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]';

export function mountModalFocusLoop(document: Document) {
  function keepFocusInsideTopDialog(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;

    const overlays = document.querySelectorAll<HTMLElement>('.overlay.open');
    const overlay = overlays.item(overlays.length - 1);
    if (!overlay) return;

    const fields = [...overlay.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(field => !field.hidden);
    if (!fields.length) return;

    const first = fields[0];
    const last = fields.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  document.addEventListener('keydown', keepFocusInsideTopDialog);
  return () => document.removeEventListener('keydown', keepFocusInsideTopDialog);
}
