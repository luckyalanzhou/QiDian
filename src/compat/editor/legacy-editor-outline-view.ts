type OutlineHeading = {
  heading: HTMLElement;
  index: number;
  level: number;
  text: string;
};

type OutlineEditor = {
  view: { posAtDOM: (node: Node, offset: number) => number };
  commands: { setTextSelection: (position: number) => unknown };
  state: { doc: { content: { size: number } } };
};

type Dependencies = {
  document: Document;
  main: HTMLElement;
};

export function createLegacyEditorOutlineView(dependencies: Dependencies) {
  const listeners = new Map<HTMLElement, EventListener>();

  function removeListeners() {
    for (const [nav, listener] of listeners) nav.removeEventListener('click', listener);
    listeners.clear();
  }

  function render(editor: OutlineEditor | null) {
    const root = dependencies.document.querySelector<HTMLElement>('#editorSurface');
    if (!root) return 0;
    const scope = root.closest<HTMLElement>('.note-shell') || dependencies.main;
    const links = [...scope.querySelectorAll<HTMLElement>('.editor-outline-links')];
    if (!links.length) return 0;

    const headings: OutlineHeading[] = [...root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')]
      .map((heading, index) => ({
        heading,
        index,
        level: Number(heading.tagName.slice(1)),
        text: (heading.textContent || '').replace(/\s+/g, ' ').trim()
      }))
      .filter(item => item.text);

    if (root.closest('.editor-card')) {
      scope.querySelectorAll<HTMLElement>('.editor-outline-mobile,.edit-inspector')
        .forEach(panel => { panel.hidden = !headings.length; });
    }

    removeListeners();
    for (const nav of links) {
      const fragment = dependencies.document.createDocumentFragment();
      if (!headings.length) {
        const empty = dependencies.document.createElement('span');
        empty.className = 'hint';
        empty.textContent = '暂无标题';
        fragment.append(empty);
      } else {
        for (const item of headings) {
          const button = dependencies.document.createElement('button');
          button.type = 'button';
          button.className = `editor-outline-link level-${item.level}`;
          button.dataset.outlineIndex = String(item.index);
          button.textContent = item.text;
          fragment.append(button);
        }
      }
      nav.replaceChildren(fragment);

      if (!editor || !headings.length) continue;
      const listener: EventListener = event => {
        const target = event.target;
        if (!(target instanceof dependencies.document.defaultView!.Element)) return;
        const button = target.closest<HTMLButtonElement>('[data-outline-index]');
        if (!button || !nav.contains(button)) return;
        const heading = headings[Number(button.dataset.outlineIndex)]?.heading;
        if (!heading) return;
        try {
          const from = editor.view.posAtDOM(heading, 0);
          editor.commands.setTextSelection(Math.min(from + 1, editor.state.doc.content.size));
          heading.scrollIntoView?.({ block: 'center' });
        } catch {
          heading.scrollIntoView?.({ block: 'center' });
        }
      };
      nav.addEventListener('click', listener);
      listeners.set(nav, listener);
    }

    return headings.length;
  }

  function dispose() {
    removeListeners();
  }

  return { render, dispose };
}
