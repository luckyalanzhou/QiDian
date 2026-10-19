import type { Editor } from '@tiptap/core';

type EditorMatch = { from: number; to: number };
type EditorSearchDependencies = {
  editor: Editor;
  root: HTMLElement;
  surface: HTMLElement;
  toggleButton: HTMLButtonElement;
  panel: HTMLElement;
  input: HTMLInputElement;
  count: HTMLElement;
  previousButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
};

export function mountEditorSearch({ editor, root, surface, toggleButton, panel, input, count, previousButton, nextButton, closeButton }: EditorSearchDependencies): () => void {
  const document = root.ownerDocument;
  let matches: EditorMatch[] = [];
  let currentIndex = -1;

  function collectMatches(query: string): EditorMatch[] {
    const result: EditorMatch[] = [];
    const seen = new Set<Text>();
    if (!query) return result;

    for (const block of root.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5,h6,pre,summary')) {
      const walker = document.createTreeWalker(block, document.defaultView?.NodeFilter.SHOW_TEXT ?? 4);
      const nodes: Array<{ node: Text; start: number }> = [];
      let text = '';
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (seen.has(node)) continue;
        seen.add(node);
        nodes.push({ node, start: text.length });
        text += node.nodeValue || '';
      }

      const lowerText = text.toLocaleLowerCase();
      const lowerQuery = query.toLocaleLowerCase();
      let offset = 0;
      while ((offset = lowerText.indexOf(lowerQuery, offset)) >= 0) {
        const end = offset + lowerQuery.length;
        const startNode = [...nodes].reverse().find(item => item.start <= offset);
        const endNode = nodes.find(item => item.start + (item.node.nodeValue || '').length >= end);
        if (startNode && endNode) {
          const range = document.createRange();
          range.setStart(startNode.node, offset - startNode.start);
          range.setEnd(endNode.node, end - endNode.start);
          try {
            result.push({
              from: editor.view.posAtDOM(range.startContainer, range.startOffset),
              to: editor.view.posAtDOM(range.endContainer, range.endOffset)
            });
          } catch {
            // Ignore matches in DOM nodes ProseMirror no longer maps.
          }
        }
        offset += Math.max(1, lowerQuery.length);
      }
    }
    return result;
  }

  function jump(step = 1) {
    matches = collectMatches(input.value.trim());
    if (!matches.length) {
      currentIndex = -1;
      count.textContent = input.value.trim() ? '未找到' : ' ';
      return;
    }
    if (currentIndex < 0) currentIndex = step < 0 ? 0 : -1;
    currentIndex = (currentIndex + step + matches.length) % matches.length;
    const match = matches[currentIndex];
    editor.commands.setTextSelection({ from: match.from, to: match.to });
    input.closest('.editor-card')?.scrollIntoView?.({ block: 'nearest' });
    count.textContent = `${currentIndex + 1} / ${matches.length}`;
  }

  function open() {
    panel.hidden = false;
    input.focus();
    input.select();
  }

  function close() {
    panel.hidden = true;
    input.value = '';
    count.textContent = '';
    matches = [];
    currentIndex = -1;
    editor.commands.focus();
  }

  function onInput() {
    currentIndex = -1;
    jump(1);
  }

  function onInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      jump(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape') {
      close();
    }
  }

  function onPrevious() {
    jump(-1);
  }

  function onNext() {
    jump(1);
  }

  function onSurfaceKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      open();
    }
  }

  toggleButton.addEventListener('click', open);
  closeButton.addEventListener('click', close);
  previousButton.addEventListener('click', onPrevious);
  nextButton.addEventListener('click', onNext);
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onInputKeydown);
  surface.addEventListener('keydown', onSurfaceKeydown);

  return () => {
    toggleButton.removeEventListener('click', open);
    closeButton.removeEventListener('click', close);
    previousButton.removeEventListener('click', onPrevious);
    nextButton.removeEventListener('click', onNext);
    input.removeEventListener('input', onInput);
    input.removeEventListener('keydown', onInputKeydown);
    surface.removeEventListener('keydown', onSurfaceKeydown);
  };
}
