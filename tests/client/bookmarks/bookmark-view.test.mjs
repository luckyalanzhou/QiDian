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

test('legacy bookmark adapter renders escaped summaries and same-origin favicon URLs', () => {
  const dom = new JSDOM('<!doctype html><main id="main"></main>', { url: 'http://localhost/' });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  try {
    const main = dom.window.document.querySelector('#main');
    const data = { bookmarks: [{
      id: 'metadata', kind: 'link', title: 'Reference', url: 'https://example.com/',
      description: 'Summary <script>alert(1)</script>', favicon: '/api/assets/123e4567-e89b-42d3-a456-426614174000'
    }], trash: [], bookmarkFolderStates: {} };
    const view = createBookmarkView({ main, getData: () => data, save: async () => true, download: () => undefined, notify: () => undefined });
    view.render();
    assert.equal(main.querySelector('.bookmark-link img').getAttribute('src'), data.bookmarks[0].favicon);
    assert.equal(main.querySelector('.bookmark-card-copy small').textContent, 'Summary <script>alert(1)</script>');
    assert.equal(main.querySelector('.bookmark-card-copy small script'), null, 'untrusted summary remains text');
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
    dom.window.close();
  }
});

test('legacy bookmark folders default to collapsed on mobile without overriding saved preferences', () => {
  const dom = new JSDOM('<!doctype html><main id="main"></main>', { url: 'http://localhost/' });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  dom.window.matchMedia = query => ({ matches: query === '(max-width: 720px)', media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });

  try {
    const main = dom.window.document.querySelector('#main');
    const data = {
      bookmarks: [{ id: 'opened', kind: 'folder', title: '已展开', children: [
        { id: 'closed', kind: 'folder', title: '已折叠', children: [
          { id: 'default-closed', kind: 'folder', title: '默认折叠', children: [{ id: 'leaf', kind: 'folder', title: '末级', children: [] }] }
        ] }
      ] }],
      trash: [],
      bookmarkFolderStates: { opened: true, closed: false }
    };
    const view = createBookmarkView({ main, getData: () => data, save: async () => true, download: () => undefined, notify: () => undefined });
    view.render();

    const disclosures = [...main.querySelectorAll('.bookmark-disclosure')];
    assert.deepEqual(disclosures.map(button => button.getAttribute('aria-expanded')), ['true', 'false', 'false'], 'saved open/closed states win while unset mobile folders collapse');
    assert.deepEqual(data.bookmarkFolderStates, { opened: true, closed: false }, 'the mobile default is not saved as a user preference');
    data.bookmarks.push({ id: 'imported', kind: 'folder', title: '导入分组', children: [{ id: 'imported-child', kind: 'folder', title: '导入子分组', children: [] }] });
    view.render();
    assert.equal([...main.querySelectorAll('.bookmark-disclosure')].at(-1).getAttribute('aria-expanded'), 'false', 'folders added after page entry still use the current mobile default');
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
    dom.window.close();
  }
});

test('legacy bookmark mobile actions use the more menu and open the correct editor', () => {
  const dom = new JSDOM('<!doctype html><main id="main"></main>', { url: 'http://localhost/' });
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: dom.window });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  dom.window.matchMedia = query => ({ matches: query === '(max-width: 720px)', media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } });

  try {
    const main = dom.window.document.querySelector('#main');
    const data = { bookmarks: [{ id: 'docs', kind: 'folder', title: '文档', children: [] }], bookmarkFolderStates: {}, trash: [] };
    const view = createBookmarkView({ main, getData: () => data, save: async () => true, download: () => undefined, notify: () => undefined });
    view.render();

    assert.ok(main.querySelector('.bookmark-desktop-action[data-bm-organize]'));
    const menu = main.querySelector('.bookmark-tools');
    menu.open = true;
    main.querySelector('.bookmark-mobile-action[data-bm-organize]').click();
    assert.equal(view.snapshot().organizing, true);
    assert.equal(main.querySelector('.bookmark-tools').open, false);

    main.querySelector('.bookmark-tools').open = true;
    main.querySelector('.bookmark-mobile-action[data-bm-new]').click();
    const overlay = dom.window.document.querySelector('#bookmarkOverlay');
    assert.equal(overlay.classList.contains('open'), true, 'the mobile add action opens the bookmark editor');
    assert.equal(overlay.querySelector('#bmParent').value, '', 'adding from the root keeps the editor in the root folder');
    assert.equal(main.querySelector('.bookmark-tools').open, false, 'the compatibility mobile add action dismisses its menu');
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
    dom.window.close();
  }
});
