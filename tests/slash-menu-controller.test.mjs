import test from 'node:test';
import assert from 'node:assert/strict';
import { createSlashMenuController } from '../src/features/editor/slash-menu-controller.ts';

function makeWindow({ width = 800, height = 600, rect = null } = {}) {
  return {
    innerWidth: width,
    innerHeight: height,
    getSelection: () => rect ? { rangeCount: 1, getRangeAt: () => ({ getBoundingClientRect: () => rect }) } : null
  };
}

test('slash menu opens below the current caret when it fits in the viewport', () => {
  const positions = [];
  const controller = createSlashMenuController({
    window: makeWindow({ rect: { left: 80, bottom: 140 } }),
    show: position => positions.push(position),
    close: () => undefined
  });

  controller.open();

  assert.deepEqual(positions, [{ left: 80, top: 148 }]);
});

test('slash menu clamps to viewport edges and falls back when there is no selection', () => {
  const positions = [];
  const controller = createSlashMenuController({
    window: makeWindow({ width: 800, height: 600, rect: { left: 790, bottom: 590 } }),
    show: position => positions.push(position),
    close: () => undefined
  });
  controller.open();
  assert.deepEqual(positions.pop(), { left: 540, top: 245 });

  const fallback = createSlashMenuController({
    window: makeWindow(),
    show: position => positions.push(position),
    close: () => undefined
  });
  fallback.open();
  assert.deepEqual(positions.pop(), { left: 400, top: 128 });
});

test('slash menu close delegates to the editor Pinia action', () => {
  let closed = 0;
  const controller = createSlashMenuController({
    window: makeWindow(),
    show: () => undefined,
    close: () => { closed += 1; }
  });

  controller.close();

  assert.equal(closed, 1);
});
