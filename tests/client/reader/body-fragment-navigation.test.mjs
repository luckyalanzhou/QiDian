import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { navigateReaderFragment, observeReaderFragmentRestoration, restoreReaderFragment, scheduleReaderFragmentRestore } from '../../../src/features/reader/body-fragment-navigation.ts';

test('body fragment clicks keep the note URL, scroll to the heading and move focus', () => {
  const dom = new JSDOM('<!doctype html><main><div id="body"><p><a href="#target-section">跳到目标章节</a></p><h2 id="target-section" tabindex="-1">目标章节</h2></div></main>', { url:'http://localhost/?qidian=note&note=note-1' });
  const { document, MouseEvent } = dom.window;
  const body = document.querySelector('#body');
  const anchor = body.querySelector('a');
  const target = document.querySelector('#target-section');
  const scrollCalls = [];
  target.scrollIntoView = options => scrollCalls.push(options);
  body.addEventListener('click', event => navigateReaderFragment(event, body));

  anchor.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true }));

  assert.equal(dom.window.location.pathname, '/');
  assert.equal(dom.window.location.search, '?qidian=note&note=note-1');
  assert.equal(dom.window.location.hash, '#target-section');
  assert.deepEqual(scrollCalls, [{ behavior:'smooth', block:'start' }]);
  assert.equal(document.activeElement, target);
  dom.window.close();
});

test('invalid or external fragments are left to normal link behavior', () => {
  const dom = new JSDOM('<!doctype html><div id="body"><a href="#missing">失效目录</a><a href="https://example.com">外链</a></div>', { url:'http://localhost/?qidian=note&note=note-1' });
  const { document, MouseEvent } = dom.window;
  const body = document.querySelector('#body');
  const anchor = body.querySelector('a');
  body.addEventListener('click', event => navigateReaderFragment(event, body));

  const click = new MouseEvent('click', { bubbles:true, cancelable:true });
  anchor.dispatchEvent(click);

  assert.equal(click.defaultPrevented, false);
  assert.equal(dom.window.location.hash, '');
  dom.window.close();
});

test('restoring a valid body fragment after rendering scrolls to and focuses the heading', () => {
  const dom = new JSDOM('<!doctype html><div id="body"><h2 id="target-section" tabindex="-1">目标章节</h2></div>', { url:'http://localhost/?qidian=note&note=note-1#target-section' });
  const { document } = dom.window;
  const body = document.querySelector('#body');
  const target = document.querySelector('#target-section');
  const scrollCalls = [];
  target.scrollIntoView = options => scrollCalls.push(options);

  assert.equal(restoreReaderFragment(body), true);
  assert.equal(dom.window.location.hash, '#target-section');
  assert.deepEqual(scrollCalls, [{ behavior:'auto', block:'start' }]);
  assert.equal(document.activeElement, target);
  dom.window.close();
});

test('restoring a missing or malformed body fragment leaves the page unchanged', () => {
  const dom = new JSDOM('<!doctype html><div id="body"><h2 id="existing" tabindex="-1">现有章节</h2></div>', { url:'http://localhost/?qidian=note&note=note-1#missing' });
  const { document } = dom.window;
  const body = document.querySelector('#body');
  const target = document.querySelector('#existing');
  const scrollCalls = [];
  target.scrollIntoView = options => scrollCalls.push(options);

  assert.equal(restoreReaderFragment(body), false);
  assert.equal(dom.window.location.hash, '#missing');
  assert.deepEqual(scrollCalls, []);
  assert.equal(document.activeElement, document.body);

  dom.window.history.replaceState(null, '', '#%E0%A4%A');
  assert.equal(restoreReaderFragment(body), false);
  assert.equal(dom.window.location.hash, '#%E0%A4%A');
  assert.deepEqual(scrollCalls, []);
  dom.window.close();
});

test('scheduled restoration waits two animation frames and skips stale reader bodies', () => {
  const dom = new JSDOM('<!doctype html><div id="body"><h2 id="target-section" tabindex="-1">目标章节</h2></div>', { url:'http://localhost/?qidian=note&note=note-1#target-section' });
  const { document } = dom.window;
  const body = document.querySelector('#body');
  const target = document.querySelector('#target-section');
  const scrollCalls = [];
  const frames = [];
  dom.window.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
  dom.window.cancelAnimationFrame = () => {};
  target.scrollIntoView = options => scrollCalls.push(options);

  const cancel = scheduleReaderFragmentRestore(body, () => true);
  assert.equal(frames.length, 1);
  frames.shift()(0);
  assert.equal(scrollCalls.length, 0, 'restoration is deferred until after the second frame');
  frames.shift()(16);
  assert.deepEqual(scrollCalls, [{ behavior:'auto', block:'start' }]);
  assert.equal(document.activeElement, target);

  const staleCancel = scheduleReaderFragmentRestore(body, () => false);
  frames.shift()(32);
  frames.shift()(48);
  assert.equal(scrollCalls.length, 1, 'stale reader workspaces do not steal focus');
  cancel();
  staleCancel();
  dom.window.close();
});

test('workspace observer restores a fragment when asynchronously rendered note content appears', async () => {
  const dom = new JSDOM('<!doctype html><main id="workspace"></main>', { url:'http://localhost/?qidian=note&note=note-1#target-section' });
  const { document } = dom.window;
  const root = document.querySelector('#workspace');
  const stop = observeReaderFragmentRestoration(root);
  const body = document.createElement('div');
  body.id = 'docRead';
  const target = document.createElement('h2');
  target.id = 'target-section';
  target.tabIndex = -1;
  target.scrollIntoView = () => { target.dataset.scrolled = 'yes'; };
  body.append(target);
  root.append(body);

  await new Promise(resolve => dom.window.setTimeout(resolve, 0));
  assert.equal(target.dataset.scrolled, 'yes');
  assert.equal(document.activeElement, target);

  stop();
  dom.window.close();
});
