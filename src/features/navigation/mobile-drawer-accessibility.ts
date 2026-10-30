export function syncMobileDrawerAccessibility(document: Document, open: boolean) {
  const sidebar = document.querySelector<HTMLElement>('#sidebar');
  const workspace = document.querySelector<HTMLElement>('.workspace');
  const mobileNavigation = document.querySelector<HTMLElement>('#qidianVueIslands');

  workspace?.toggleAttribute('inert', open);
  mobileNavigation?.toggleAttribute('inert', open);
  if (!sidebar) return;

  if (open) {
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    sidebar.setAttribute('aria-label', '主导航菜单');
  } else {
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
    sidebar.removeAttribute('aria-label');
  }
}
