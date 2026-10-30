export function navigateReaderFragment(event: MouseEvent, body: HTMLElement | null) {
  const clicked = event.target as Element | null;
  if (!clicked || typeof clicked.closest !== 'function' || !body) return;

  const anchor = clicked.closest<HTMLAnchorElement>('a[href^="#"]');
  if (!anchor || !body.contains(anchor)) return;

  let fragment = '';
  try {
    fragment = decodeURIComponent((anchor.getAttribute('href') || '').slice(1));
  } catch {
    return;
  }
  if (!fragment) return;

  const target = body.ownerDocument.getElementById(fragment);
  const view = body.ownerDocument.defaultView;
  if (!target || !body.contains(target) || !view) return;

  event.preventDefault();
  const url = new URL(view.location.href);
  url.hash = fragment;
  view.history.replaceState(view.history.state, '', url);
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  target.focus({ preventScroll: true });
}

export function restoreReaderFragment(body: HTMLElement | null): boolean {
  if (!body) return false;

  const view = body.ownerDocument.defaultView;
  if (!view || !view.location.hash) return false;

  let fragment = '';
  try {
    fragment = decodeURIComponent(view.location.hash.slice(1));
  } catch {
    return false;
  }
  if (!fragment) return false;

  const target = body.ownerDocument.getElementById(fragment);
  if (!target || !body.contains(target)) return false;

  target.scrollIntoView({ behavior: 'auto', block: 'start' });
  target.focus({ preventScroll: true });
  return true;
}

export function scheduleReaderFragmentRestore(body: HTMLElement | null, isCurrent: () => boolean = () => true): () => void {
  const view = body?.ownerDocument.defaultView;
  if (!body || !view || !view.location.hash) return () => {};

  let cancelled = false;
  let secondFrame = 0;
  const firstFrame = view.requestAnimationFrame(() => {
    secondFrame = view.requestAnimationFrame(() => {
      if (!cancelled && body.isConnected && isCurrent()) restoreReaderFragment(body);
    });
  });

  return () => {
    cancelled = true;
    view.cancelAnimationFrame(firstFrame);
    if (secondFrame) view.cancelAnimationFrame(secondFrame);
  };
}

export function observeReaderFragmentRestoration(root: HTMLElement | null): () => void {
  const view = root?.ownerDocument.defaultView;
  if (!root || !view || typeof view.MutationObserver !== 'function') return () => {};

  let restoredUrl = '';
  const restore = () => {
    const url = view.location.href;
    if (!view.location.hash || url === restoredUrl) return;
    const body = root.querySelector<HTMLElement>('#docRead');
    if (body && restoreReaderFragment(body)) restoredUrl = url;
  };
  const observer = new view.MutationObserver(restore);
  observer.observe(root, { childList: true, subtree: true });
  view.addEventListener('hashchange', restore);
  restore();

  return () => {
    observer.disconnect();
    view.removeEventListener('hashchange', restore);
  };
}
