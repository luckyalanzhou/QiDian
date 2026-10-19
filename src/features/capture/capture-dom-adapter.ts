type CaptureDOMDependencies = {
  window: Window & typeof globalThis;
  document: Document;
  getPad: () => HTMLElement | null;
};

export function createCaptureDOMAdapter({ window, document, getPad }: CaptureDOMDependencies) {
  function captureSelection(pad: HTMLElement | null = getPad()): Range | null {
    if (!pad) return null;
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const parent = range.commonAncestorContainer;
    return parent === pad || pad.contains(parent) ? range.cloneRange() : null;
  }

  function placeFragment(fragment: DocumentFragment, targetRange: Range | null = null) {
    const pad = getPad();
    if (!pad) return;
    const range = targetRange || captureSelection(pad);
    const selection = window.getSelection();
    if (!range) {
      pad.appendChild(fragment);
      pad.focus();
      return;
    }
    range.deleteContents();
    const last = fragment.lastChild;
    range.insertNode(fragment);
    if (last && selection) {
      range.setStartAfter(last);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function insertHTML(html: string, targetRange: Range | null = null) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    placeFragment(template.content, targetRange);
  }

  function insertText(text: string, targetRange: Range | null = null) {
    const pad = getPad();
    if (!pad) return;
    const range = targetRange || captureSelection(pad);
    const start = range?.startContainer;
    const startElement = start?.nodeType === 1 ? start as Element : start?.parentElement;
    if (startElement?.closest('pre,code')) {
      const fragment = document.createDocumentFragment();
      fragment.appendChild(document.createTextNode(String(text || '')));
      placeFragment(fragment, range);
      return;
    }
    const fragment = document.createDocumentFragment();
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    lines.forEach((line, index) => {
      if (index) fragment.appendChild(document.createElement('br'));
      if (line) fragment.appendChild(document.createTextNode(line));
    });
    placeFragment(fragment, range);
  }

  return { captureSelection, insertHTML, insertText };
}
