import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountCodeCopyButtons } from '../src/features/reader/code-copy.ts';

test('reader code controls mount once, copy through the clipboard, and clean up listeners', async () => {
  const dom = new JSDOM('<article id="reader"><pre><code>docker compose up -d</code></pre></article>', {
    url: 'https://qidian.example.test',
    pretendToBeVisual: true
  });
  const { document } = dom.window;
  const root = document.querySelector('#reader');
  Object.defineProperty(dom.window, 'isSecureContext', { configurable: true, value: true });
  const copied = [];
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async text => copied.push(text) }
  });
  const notifications = [];

  let cleanup = mountCodeCopyButtons(root, message => notifications.push(message));
  const button = root.querySelector('.copy-code');
  assert.ok(button);
  assert.equal(button.closest('pre'), null);
  assert.equal(root.querySelectorAll('.copy-code').length, 1);

  button.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(copied, ['docker compose up -d']);
  assert.equal(button.getAttribute('aria-label'), '已复制代码');

  cleanup = mountCodeCopyButtons(root, message => notifications.push(message));
  assert.equal(root.querySelectorAll('.code-block').length, 1, 're-running the Vue effect does not wrap pre twice');
  assert.equal(root.querySelectorAll('.copy-code').length, 1, 're-running the Vue effect reuses its button');
  cleanup();
  button.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(copied.length, 1, 'cleanup removes the event listener');
  assert.deepEqual(notifications, []);
  dom.window.close();
});

test('reader code control cleanup prevents a pending clipboard result from mutating detached UI', async () => {
  const dom = new JSDOM('<article id="reader"><pre><code>echo test</code></pre></article>', {
    url: 'https://qidian.example.test',
    pretendToBeVisual: true
  });
  const root = dom.window.document.querySelector('#reader');
  Object.defineProperty(dom.window, 'isSecureContext', { configurable: true, value: true });
  let resolveCopy;
  Object.defineProperty(dom.window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: () => new Promise(resolve => { resolveCopy = resolve; }) }
  });
  const cleanup = mountCodeCopyButtons(root, () => {});
  const button = root.querySelector('.copy-code');
  assert.ok(button);
  button.click();
  cleanup();
  resolveCopy();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(button.getAttribute('aria-label'), '复制代码');
  dom.window.close();
});
