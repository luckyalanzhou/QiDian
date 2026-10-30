export function getWorkspaceScroller(target: Window = window): HTMLElement | null {
  const candidates = target.document?.querySelectorAll?.<HTMLElement>('.workspace > .main') || [];
  for (const candidate of candidates) {
    if (candidate.hidden) continue;
    const overflowY = target.getComputedStyle?.(candidate).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return candidate;
  }
  return null;
}

export function getWorkspaceScrollTop(target: Window = window): number {
  return getWorkspaceScroller(target)?.scrollTop ?? target.scrollY;
}

export function scrollWorkspaceTo(target: Window = window, top: number): void {
  const position = Math.max(0, top);
  const scroller = getWorkspaceScroller(target);
  if (scroller) scroller.scrollTop = position;
  else target.scrollTo({ top: position, behavior: 'instant' as ScrollBehavior });
}

export function listenToWorkspaceScroll(target: Window, listener: EventListener): () => void {
  const scrollers = Array.from(target.document?.querySelectorAll?.<HTMLElement>('.workspace > .main') || []);
  target.addEventListener('scroll', listener, { passive: true });
  for (const scroller of scrollers) scroller.addEventListener('scroll', listener, { passive: true });
  return () => {
    target.removeEventListener('scroll', listener);
    for (const scroller of scrollers) scroller.removeEventListener('scroll', listener);
  };
}
