type Dependencies = {
  document: Document;
  scheduleFocus: (callback: () => void) => unknown;
};

export function createLegacyCategoryDialog(dependencies: Dependencies) {
  const overlay = dependencies.document.querySelector<HTMLElement>('#categoryOverlay');
  const input = dependencies.document.querySelector<HTMLInputElement>('#categoryNameInput');
  const message = dependencies.document.querySelector<HTMLElement>('#categoryDialogMessage');

  function open() {
    if (!overlay || !input || !message) return false;
    input.value = '';
    message.textContent = '';
    overlay.classList.add('open');
    dependencies.scheduleFocus(() => input.focus());
    return true;
  }

  function close() {
    overlay?.classList.remove('open');
  }

  function readInput() {
    return input?.value || '';
  }

  function showError(error: unknown) {
    if (!message) return;
    const detail = error && typeof error === 'object' && 'message' in error
      ? String(error.message || '')
      : '';
    message.textContent = detail || '分类尚未保存';
    input?.focus();
  }

  return { open, close, readInput, showError };
}
