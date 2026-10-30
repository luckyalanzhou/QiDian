import test from 'node:test';
import assert from 'node:assert/strict';
import { getWorkspaceScrollTop, listenToWorkspaceScroll, scrollWorkspaceTo } from '../../../src/features/navigation/workspace-scroll.ts';

function createScroller({ hidden = false, overflowY = 'auto', scrollTop = 0 } = {}) {
  const listeners = new Set();
  return {
    hidden,
    overflowY,
    scrollTop,
    addEventListener: (_name, listener) => listeners.add(listener),
    removeEventListener: (_name, listener) => listeners.delete(listener),
    dispatchScroll: () => { for (const listener of listeners) listener(); },
    listenerCount: () => listeners.size
  };
}

function createWindow(scrollers) {
  const listeners = new Set();
  let windowScrollY = 24;
  return {
    document: { querySelectorAll: () => scrollers },
    getComputedStyle: element => ({ overflowY: element.overflowY }),
    get scrollY() { return windowScrollY; },
    scrollTo: ({ top }) => { windowScrollY = top; },
    addEventListener: (_name, listener) => listeners.add(listener),
    removeEventListener: (_name, listener) => listeners.delete(listener),
    get windowListenerCount() { return listeners.size; }
  };
}

test('workspace scroll helpers use the visible main scroller on mobile', () => {
  const hidden = createScroller({ hidden: true, scrollTop: 800 });
  const active = createScroller({ scrollTop: 428 });
  const window = createWindow([hidden, active]);

  assert.equal(getWorkspaceScrollTop(window), 428);
  scrollWorkspaceTo(window, 0);
  assert.equal(active.scrollTop, 0);
  assert.equal(hidden.scrollTop, 800);
});

test('workspace scroll listeners follow both workspace main containers and clean up', () => {
  const hidden = createScroller({ hidden: true });
  const active = createScroller();
  const window = createWindow([hidden, active]);
  let calls = 0;
  const stop = listenToWorkspaceScroll(window, () => { calls += 1; });

  assert.equal(hidden.listenerCount(), 1);
  assert.equal(active.listenerCount(), 1);
  active.dispatchScroll();
  assert.equal(calls, 1);

  stop();
  assert.equal(hidden.listenerCount(), 0);
  assert.equal(active.listenerCount(), 0);
  assert.equal(window.windowListenerCount, 0);
});

test('workspace scroll helpers fall back to the window when no workspace scroller exists', () => {
  const window = createWindow([]);
  assert.equal(getWorkspaceScrollTop(window), 24);
  scrollWorkspaceTo(window, 72);
  assert.equal(window.scrollY, 72);
});
