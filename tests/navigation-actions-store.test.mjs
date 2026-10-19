import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinia } from 'pinia';
import { useNavigationActionsStore } from '../src/features/navigation/navigation-actions-store.ts';

test('navigation action store delegates typed commands to the bound application boundary', () => {
  const store = useNavigationActionsStore(createPinia());
  const commands = [];
  store.bind(command => { commands.push(command); return true; });
  const command = { type: 'open-note', id: 'note-17', forceEdit: true };

  assert.equal(store.execute(command), true);
  assert.deepEqual(commands, [command]);
});

test('navigation action store is inert until the application binds its command boundary', () => {
  const store = useNavigationActionsStore(createPinia());

  assert.equal(store.execute({ type: 'dashboard' }), false);
});
