import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDashboardActions } from '../../../src/features/dashboard/actions.ts';

function createHarness(value) {
  let mutations = 0;
  let saves = 0;
  const actions = createDashboardActions({
    getVault: () => value,
    mutateVault: operation => {
      mutations += 1;
      return operation(value);
    },
    persist: () => {
      saves += 1;
    }
  });
  return { actions, value, get mutations() { return mutations; }, get saves() { return saves; } };
}

test('dashboard folder and layout preferences mutate the vault and persist only changed values', () => {
  const harness = createHarness({ dashboardBookmarkLayout: 'single', dashboardBookmarkFolders: { retained: true } });

  harness.actions.saveFolder('reading', false);
  harness.actions.setLayout('double');
  harness.actions.saveFolder('reading', false);
  harness.actions.setLayout('double');

  assert.deepEqual(harness.value.dashboardBookmarkFolders, { retained: true, reading: false });
  assert.equal(harness.value.dashboardBookmarkLayout, 'double');
  assert.equal(harness.mutations, 2);
  assert.equal(harness.saves, 2);
});

test('dashboard expands or collapses many folders in one vault mutation and keeps unrelated preferences', () => {
  const harness = createHarness({ dashboardBookmarkFolders: { retained: false, first: false } });

  harness.actions.setAllFolders(['first', 'second', 'second'], true);
  harness.actions.setAllFolders(['first', 'second'], true);

  assert.deepEqual(harness.value.dashboardBookmarkFolders, { retained: false, first: true, second: true });
  assert.equal(harness.mutations, 1);
  assert.equal(harness.saves, 1);
});
