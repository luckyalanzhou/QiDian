import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_NOTE_TYPES, validateVault } from '../../../shared/vault-validation.js';
import { createCategoryDialogFlow } from '../../../src/features/categories/category-dialog-flow.ts';
import { createVaultMutation } from '../../../src/features/vault/mutation.ts';

function fixture({ saveError = '' } = {}) {
  let vault = validateVault({ categories: ['工作'], noteTypes: DEFAULT_NOTE_TYPES, notes: [], bookmarks: [], trash: [] });
  const saves = [];
  const mutation = createVaultMutation({
    getVault: () => vault,
    replaceVault: value => { vault = value; return value; },
    save: async () => {
      if (saveError) throw new Error(saveError);
      saves.push(structuredClone(vault));
    }
  });
  const flow = createCategoryDialogFlow({ getVault: () => vault, mutateVault: mutation });
  return { flow, getVault: () => vault, saves };
}

test('category creation trims the name and resolves only after the Vault mutation persists', async () => {
  const state = fixture();
  const saved = await state.flow.save('  系统维护  ');

  assert.equal(saved, '系统维护');
  assert.deepEqual(state.getVault().categories, ['工作', '系统维护']);
  assert.deepEqual(state.saves[0].categories, ['工作', '系统维护']);
});

test('category creation rejects blank, oversized and duplicate names without saving', async () => {
  const state = fixture();

  await assert.rejects(state.flow.save('  '), /请输入分类名称/);
  await assert.rejects(state.flow.save('分类'.repeat(16)), /最多 30 个字符/);
  await assert.rejects(state.flow.save('工作'), /这个分类已存在/);
  assert.deepEqual(state.getVault().categories, ['工作']);
  assert.equal(state.saves.length, 0);
});

test('a failed category write rolls the Vault back and keeps the failure visible to the dialog', async () => {
  const state = fixture({ saveError: 'SQLite 提交失败' });

  await assert.rejects(state.flow.save('待保存'), /SQLite 提交失败/);
  assert.deepEqual(state.getVault().categories, ['工作']);
  assert.equal(state.saves.length, 0);
});
