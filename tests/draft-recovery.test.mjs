import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftRecoveryState } from '../src/draft-recovery.js';

test('matching revisions restore automatically and never ask repeatedly', () => {
  assert.equal(draftRecoveryState({ pending: true, revision: 8 }, 8), 'restore');
});

test('a new cloud revision asks once unless this conflict was already acknowledged', () => {
  assert.equal(draftRecoveryState({ pending: true, revision: 7 }, 8), 'ask');
  assert.equal(draftRecoveryState({ pending: true, revision: 7, conflictAcceptedCloudRevision: 8 }, 8), 'restore-conflict');
  assert.equal(draftRecoveryState({ pending: true, revision: 7, conflictAcceptedCloudRevision: 8 }, 9), 'ask');
});

test('completed or missing drafts do not trigger recovery', () => {
  assert.equal(draftRecoveryState(null, 8), 'none');
  assert.equal(draftRecoveryState({ pending: false, revision: 7 }, 8), 'none');
});
