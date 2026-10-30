import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountSkipToMainContent } from '../../../src/features/navigation/skip-to-main-content.ts';

test('skip link focuses the active workspace main without adding a URL fragment', () => {
  const dom = new JSDOM('<a id="skipToMain" href="#dashboardHost">跳到主要内容</a><main id="main" tabindex="-1" hidden></main><div id="dashboardHost" role="main" tabindex="-1"></div>', { url: 'http://localhost/' });
  const { document } = dom.window;
  const dispose = mountSkipToMainContent(document);

  document.querySelector('#skipToMain')?.click();

  assert.equal(document.activeElement, document.querySelector('#dashboardHost'));
  assert.equal(dom.window.location.hash, '');
  dispose();
  dom.window.close();
});

test('skip link falls back to the legacy main when the Vue host is hidden', () => {
  const dom = new JSDOM('<a id="skipToMain" href="#dashboardHost">跳到主要内容</a><main id="main" tabindex="-1"></main><div id="dashboardHost" role="main" tabindex="-1" hidden></div>', { url: 'http://localhost/' });
  const { document } = dom.window;
  const dispose = mountSkipToMainContent(document);

  document.querySelector('#skipToMain')?.click();

  assert.equal(document.activeElement, document.querySelector('#main'));
  assert.equal(dom.window.location.hash, '');
  dispose();
  dom.window.close();
});

test('skip link closes an open mobile drawer before focusing the inert workspace', () => {
  const dom = new JSDOM('<aside id="sidebar" aria-modal="true"><a id="skipToMain" href="#dashboardHost">跳到主要内容</a></aside><div class="workspace" inert><div id="dashboardHost" role="main" tabindex="-1"></div></div>', { url: 'http://localhost/' });
  const { document } = dom.window;
  const scheduled = [];
  const dispose = mountSkipToMainContent(document, {
    closeMobileDrawer: () => {
      document.querySelector('#sidebar')?.removeAttribute('aria-modal');
      document.querySelector('.workspace')?.removeAttribute('inert');
      return true;
    },
    scheduleFocus: callback => scheduled.push(callback)
  });

  const link = document.querySelector('#skipToMain');
  link?.focus();
  link?.click();

  assert.equal(document.activeElement, link);
  assert.equal(document.querySelector('.workspace')?.hasAttribute('inert'), false);
  assert.equal(scheduled.length, 1);
  scheduled[0]();
  assert.equal(document.activeElement, document.querySelector('#dashboardHost'));
  assert.equal(dom.window.location.hash, '');
  dispose();
  dom.window.close();
});
