import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { syncMobileDrawerAccessibility } from '../../../src/features/navigation/mobile-drawer-accessibility.ts';

test('opening the drawer gives it modal navigation semantics and makes the workspace inert', () => {
  const dom = new JSDOM('<aside id="sidebar"></aside><div class="workspace"></div><div id="qidianVueIslands"><nav class="bottom-nav"></nav></div>');
  const { document } = dom.window;
  const sidebar = document.querySelector('#sidebar');
  const workspace = document.querySelector('.workspace');
  const mobileNavigation = document.querySelector('#qidianVueIslands');

  syncMobileDrawerAccessibility(document, true);

  assert.equal(sidebar.getAttribute('role'), 'dialog');
  assert.equal(sidebar.getAttribute('aria-modal'), 'true');
  assert.equal(sidebar.getAttribute('aria-label'), '主导航菜单');
  assert.equal(workspace.hasAttribute('inert'), true);
  assert.equal(mobileNavigation.hasAttribute('inert'), true, 'the bottom navigation behind the drawer is unavailable while it is open');

  dom.window.close();
});

test('closing or unmounting the drawer restores the complementary landmark and workspace', () => {
  const dom = new JSDOM('<aside id="sidebar" role="dialog" aria-modal="true" aria-label="主导航菜单"></aside><div class="workspace" inert></div><div id="qidianVueIslands" inert><nav class="bottom-nav"></nav></div>');
  const { document } = dom.window;
  const sidebar = document.querySelector('#sidebar');
  const workspace = document.querySelector('.workspace');
  const mobileNavigation = document.querySelector('#qidianVueIslands');

  syncMobileDrawerAccessibility(document, false);

  assert.equal(sidebar.hasAttribute('role'), false, 'the native aside complementary landmark is restored');
  assert.equal(sidebar.hasAttribute('aria-modal'), false);
  assert.equal(sidebar.hasAttribute('aria-label'), false);
  assert.equal(workspace.hasAttribute('inert'), false);
  assert.equal(mobileNavigation.hasAttribute('inert'), false);

  dom.window.close();
});

test('missing shell elements do not prevent drawer accessibility cleanup', () => {
  const dom = new JSDOM('<main></main>');
  assert.doesNotThrow(() => syncMobileDrawerAccessibility(dom.window.document, true));
  assert.doesNotThrow(() => syncMobileDrawerAccessibility(dom.window.document, false));
  dom.window.close();
});
