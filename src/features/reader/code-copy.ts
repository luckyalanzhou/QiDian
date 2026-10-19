const copyIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
const checkIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
const mountedCopies = new WeakMap<HTMLElement, () => void>();

async function copyText(document: Document, text: string): Promise<boolean> {
  const view = document.defaultView;
  if (view?.isSecureContext && typeof view.navigator.clipboard?.writeText === 'function') {
    try {
      await view.navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Clipboard access can be denied even on a secure origin; try the selection fallback.
    }
  }

  let field: HTMLTextAreaElement | null = null;
  const previous = document.activeElement as HTMLElement | null;
  try {
    field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.setAttribute('aria-hidden', 'true');
    Object.assign(field.style, {
      position: 'fixed', left: '-9999px', top: '0', width: '1px', height: '1px', padding: '0', opacity: '0'
    });
    document.body.appendChild(field);
    field.focus({ preventScroll: true });
    field.select();
    field.setSelectionRange(0, field.value.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field?.remove();
    try {
      previous?.focus({ preventScroll: true });
    } catch {
      previous?.focus?.();
    }
  }
}

export function mountCodeCopyButtons(root: HTMLElement, notify: (message: string) => void): () => void {
  mountedCopies.get(root)?.();
  let disposed = false;
  const cleanups: Array<() => void> = [];
  const timers = new Set<number>();

  root.querySelectorAll<HTMLPreElement>('pre').forEach(pre => {
    const document = root.ownerDocument;
    let wrapper = pre.parentElement?.classList.contains('code-block') ? pre.parentElement : null;
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'code-block';
      pre.parentNode?.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);
    }

    let button = wrapper.querySelector<HTMLButtonElement>('.copy-code');
    if (!button) {
      button = document.createElement('button');
      button.className = 'copy-code';
      button.type = 'button';
      wrapper.appendChild(button);
    }
    button.title = '复制代码';
    button.setAttribute('aria-label', '复制代码');
    button.innerHTML = copyIcon;

    const copyButton = button;
    const onClick = async () => {
      const text = pre.querySelector('code')?.textContent || pre.textContent || '';
      if (await copyText(document, text)) {
        if (disposed) return;
        copyButton.innerHTML = checkIcon;
        copyButton.title = '已复制';
        copyButton.setAttribute('aria-label', '已复制代码');
        const view = document.defaultView;
        if (view) {
          const timer = view.setTimeout(() => {
            timers.delete(timer);
            if (disposed) return;
            copyButton.innerHTML = copyIcon;
            copyButton.title = '复制代码';
            copyButton.setAttribute('aria-label', '复制代码');
          }, 1500);
          timers.add(timer);
        }
      } else if (!disposed) {
        notify('复制失败，请手动选择代码');
      }
    };
    copyButton.addEventListener('click', onClick);
    cleanups.push(() => copyButton.removeEventListener('click', onClick));
  });

  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    cleanups.forEach(dispose => dispose());
    const view = root.ownerDocument.defaultView;
    if (view) timers.forEach(timer => view.clearTimeout(timer));
    timers.clear();
    if (mountedCopies.get(root) === cleanup) mountedCopies.delete(root);
  };
  mountedCopies.set(root, cleanup);
  return cleanup;
}
