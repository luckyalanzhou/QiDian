import test from 'node:test';
import assert from 'node:assert/strict';
import { createCategoryDialogController } from '../src/features/categories/category-dialog-controller.ts';

function createHarness({ vueMounted = false, saveError = null } = {}) {
  const calls = [];
  const vueDialog = {
    open: () => calls.push('vue-open'),
    close: () => calls.push('vue-close')
  };
  const legacyDialog = {
    open: () => calls.push('legacy-open'),
    close: () => calls.push('legacy-close'),
    readInput: () => ' 新分类 ',
    showError: error => calls.push(['error', error.message])
  };
  const controller = createCategoryDialogController({
    closeMenu: () => calls.push('close-menu'),
    vueMounted,
    vueDialog,
    legacyDialog,
    save: async name => {
      calls.push(['save', name]);
      if (saveError) throw new Error(saveError);
      return name.trim();
    },
    onCreated: name => calls.push(['created', name])
  });
  return { calls, controller };
}

test('category controller routes open, close, and successful save to Vue dialog', async () => {
  const { calls, controller } = createHarness({ vueMounted: true });

  controller.open();
  controller.close();
  await controller.saveVue(' 新分类 ');

  assert.deepEqual(calls, [
    'close-menu', 'vue-open', 'vue-close',
    ['save', ' 新分类 '], ['created', '新分类']
  ]);
});

test('category controller saves legacy input and reports failures without closing the dialog', async () => {
  const success = createHarness();
  success.controller.open();
  await success.controller.saveLegacy();
  assert.deepEqual(success.calls, [
    'close-menu', 'legacy-open', ['save', ' 新分类 '],
    'legacy-close', ['created', '新分类']
  ]);

  const failure = createHarness({ saveError: 'SQLite 写入失败' });
  failure.controller.open();
  await failure.controller.saveLegacy();
  assert.deepEqual(failure.calls, [
    'close-menu', 'legacy-open', ['save', ' 新分类 '], ['error', 'SQLite 写入失败']
  ]);
});

test('Vue category save leaves error presentation to the Vue store', async () => {
  const { calls, controller } = createHarness({ vueMounted: true, saveError: '分类已存在' });

  await assert.rejects(controller.saveVue('重复分类'), /分类已存在/);
  assert.deepEqual(calls, [['save', '重复分类']]);
});
