import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createBookmarkView } from '../../../src/compat/bookmarks-view.js';

test('legacy bookmark adapter filters in place and retains search focus', () => {
  const dom = new JSDOM('<!doctype html><main id="main"></main>', { url: 'http://localhost/' });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });

  try {
    const main = dom.window.document.querySelector('#main');
    const data = {
      bookmarks: [
        { id: 'docs-link', kind: 'link', title: 'OpenWrt Docs', url: 'https://openwrt.org/docs' },
        { id: 'other-link', kind: 'link', title: 'Other', url: 'https://example.com/' }
      ],
      trash: [],
      bookmarkFolderStates: {}
    };
    const view = createBookmarkView({
      main,
      getData: () => data,
      save: async () => true,
      download: () => undefined,
      notify: () => undefined
    });

    view.render();
    const search = main.querySelector('#bookmarkSearch');
    search.focus();
    search.value = 'docs';
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));

    assert.equal(main.querySelector('#bookmarkSearch'), search);
    assert.equal(dom.window.document.activeElement, search);
    assert.match(main.querySelector('#bookmarkTree').textContent, /OpenWrt Docs/);
    assert.doesNotMatch(main.querySelector('#bookmarkTree').textContent, /Other/);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
    dom.window.close();
  }
});
