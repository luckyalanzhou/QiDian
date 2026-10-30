import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsername, PASSWORD_ITERATIONS, SESSION_IDLE_TTL, SESSION_TTL } from '../../server/auth.js';

test('account identifiers are normalized and constrained', () => {
  assert.equal(normalizeUsername('  Alan_01  '), 'alan_01');
  assert.equal(normalizeUsername('  Alan_01  '), 'alan_01');
  assert.throws(() => normalizeUsername('owner@invalid'));
  assert.throws(() => normalizeUsername(''));
  for (const name of ['ab', '中英文', '-starts-wrong', 'contains space']) assert.throws(() => normalizeUsername(name));
  assert.equal(PASSWORD_ITERATIONS, 600000);
  assert.equal(SESSION_TTL, 7 * 24 * 60 * 60 * 1000);
  assert.equal(SESSION_IDLE_TTL, 3 * 24 * 60 * 60 * 1000);
});
