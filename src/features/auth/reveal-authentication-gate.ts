export function revealAuthenticationGate(document: Document, host: HTMLElement) {
  document.body.classList.remove('booting');
  host.hidden = false;
}
