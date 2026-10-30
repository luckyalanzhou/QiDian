type ItemMenuWindow = Window & typeof globalThis;

export function mountItemMenuController(document: Document, window: ItemMenuWindow) {
  let frame = 0;

  function positionOpenMenus() {
    frame = 0;
    const layoutViewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    const compact = window.matchMedia?.('(max-width: 720px)').matches ?? window.innerWidth <= 720;
    const visualViewport = compact ? window.visualViewport : null;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const viewportBottom = visualViewport
      ? visualViewport.offsetTop + visualViewport.height
      : layoutViewportHeight;
    const viewportHeight = Math.max(0, viewportBottom - viewportTop);

    document.querySelectorAll<HTMLDetailsElement>('.item-menu[open]').forEach((menu) => {
      const panel = menu.querySelector<HTMLElement>(':scope > .item-menu-panel');
      if (!panel) return;

      menu.classList.remove('opens-left');
      panel.style.translate = '';
      const rect = menu.getBoundingClientRect();
      const bottomNav = compact ? document.querySelector<HTMLElement>('.bottom-nav') : null;
      const bottomNavBounds = bottomNav?.getBoundingClientRect();
      const bottomNavVisible = bottomNavBounds != null
        && bottomNavBounds.top < viewportBottom
        && bottomNavBounds.bottom > viewportTop;
      const bottomInset = bottomNavVisible
        ? Math.max(0, viewportBottom - Math.max(viewportTop, bottomNavBounds.top))
        : 8;
      const spaceBelow = Math.max(0, viewportBottom - rect.bottom - bottomInset);
      const spaceAbove = Math.max(0, rect.top - viewportTop - 8);
      const heightLimit = viewportHeight * (compact ? 0.55 : 0.65);
      const naturalHeight = Math.min(panel.scrollHeight, heightLimit);
      const opensUp = spaceBelow < naturalHeight + 8 && spaceAbove > spaceBelow;

      menu.classList.toggle('opens-up', opensUp);
      panel.style.maxHeight = `${Math.max(0, Math.min(heightLimit, (opensUp ? spaceAbove : spaceBelow) - 8))}px`;
      menu.classList.toggle('opens-left', panel.getBoundingClientRect().left < 8);
      const bounds = panel.getBoundingClientRect();
      const shift = bounds.left < 8 ? 8 - bounds.left
        : bounds.right > viewportWidth - 8 ? viewportWidth - 8 - bounds.right : 0;
      if (shift) panel.style.translate = `${shift}px 0`;
    });
  }

  function schedulePosition() {
    if (frame || !window.requestAnimationFrame) return;
    frame = window.requestAnimationFrame(positionOpenMenus);
  }

  function positionOpenMenusImmediately() {
    if (frame && window.cancelAnimationFrame) window.cancelAnimationFrame(frame);
    frame = 0;
    positionOpenMenus();
  }

  function onSummaryClick(event: Event) {
    const target = event.target as Element | null;
    const summary = target?.closest?.('.item-menu > summary');
    const menu = summary?.parentElement as HTMLDetailsElement | null;
    if (!summary || !menu) return;

    if (!menu.open && menu.matches('.editor-extra-tools.item-menu')
      && (window.matchMedia?.('(max-width: 720px)').matches ?? window.innerWidth <= 720)) {
      const panel = menu.querySelector<HTMLElement>(':scope > .editor-extra-panel');
      const width = panel ? Number.parseFloat(window.getComputedStyle(panel).width) : Number.NaN;
      if (panel && Number.isFinite(width)) {
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const left = menu.getBoundingClientRect().left;
        const right = left + width;
        const shift = left < 8 ? 8 - left
          : right > viewportWidth - 8 ? viewportWidth - 8 - right : 0;
        panel.style.translate = shift ? `${shift}px 0` : '';
      }
    }

    schedulePosition();
  }

  function onToggle(event: Event) {
    const menu = event.target as HTMLDetailsElement | null;
    if (!menu?.matches?.('.item-menu')) return;
    if (!menu.open) {
      menu.classList.remove('opens-up');
      const panel = menu.querySelector<HTMLElement>(':scope > .item-menu-panel');
      if (panel) {
        panel.style.maxHeight = '';
        panel.style.translate = '';
      }
    } else {
      positionOpenMenusImmediately();
    }
  }

  function closeMenusOutside(event: Event) {
    const target = event.target as Node | null;
    document.querySelectorAll<HTMLDetailsElement>('.item-menu[open]').forEach((menu) => {
      if (target && !menu.contains(target)) menu.open = false;
    });
  }

  function onVisualViewportChange() {
    schedulePosition();
  }

  document.addEventListener('click', onSummaryClick, true);
  document.addEventListener('toggle', onToggle, true);
  document.addEventListener('scroll', schedulePosition, true);
  window.addEventListener('resize', schedulePosition);
  window.visualViewport?.addEventListener('resize', onVisualViewportChange);
  window.visualViewport?.addEventListener('scroll', onVisualViewportChange);
  document.addEventListener('click', closeMenusOutside);

  return {
    schedulePosition,
    destroy() {
      document.removeEventListener('click', onSummaryClick, true);
      document.removeEventListener('toggle', onToggle, true);
      document.removeEventListener('scroll', schedulePosition, true);
      window.removeEventListener('resize', schedulePosition);
      window.visualViewport?.removeEventListener('resize', onVisualViewportChange);
      window.visualViewport?.removeEventListener('scroll', onVisualViewportChange);
      document.removeEventListener('click', closeMenusOutside);
      if (frame && window.cancelAnimationFrame) window.cancelAnimationFrame(frame);
      frame = 0;
    }
  };
}
