import test from 'node:test';
import assert from 'node:assert/strict';
import { mountWorkspaceSession } from '../src/features/lifecycle/workspace-session.ts';

function createOptions(overrides = {}) {
  const events = [];
  return {
    events,
    options: {
      initial: { local: true },
      theme: 'system',
      currentVersion: '0.0.21',
      vault: { notes: [] },
      applyTheme: theme => events.push(`theme:${theme}`),
      render: () => events.push('render'),
      renderVersionBadge: state => events.push(`version:${state.currentVersion}:${state.updateAvailable}`),
      checkUpdates: () => events.push('check-updates'),
      queueSave: vault => events.push(`queue-save:${vault.notes.length}`),
      dispose: [() => events.push('dispose-interactions'), () => events.push('dispose-lifecycle'), () => events.push('dispose-theme'), () => events.push('clear-autosave'), () => events.push('destroy-editor')],
      ...overrides
    }
  };
}

test('local workspace startup applies theme, renders and skips remote update checks', () => {
  const { options, events } = createOptions();
  mountWorkspaceSession(options);
  assert.deepEqual(events, ['theme:system', 'render', 'version:0.0.21:false']);
});

test('authenticated workspace startup checks for updates after the initial render', () => {
  const { options, events } = createOptions({ initial: { local: false } });
  mountWorkspaceSession(options);
  assert.deepEqual(events, ['theme:system', 'render', 'version:0.0.21:false', 'check-updates']);
});

test('only a conflict-free recovered draft is queued after authenticated startup', () => {
  const vault = { notes: [{ id: 'recovered' }] };
  const accepted = createOptions({ initial: { local: false, restoreDraft: true }, vault });
  mountWorkspaceSession(accepted.options);
  assert.deepEqual(accepted.events.slice(-2), ['check-updates', 'queue-save:1']);

  const conflicted = createOptions({ initial: { local: false, restoreDraft: true, restoreConflict: true } });
  mountWorkspaceSession(conflicted.options);
  assert.equal(conflicted.events.includes('queue-save:0'), false);
});

test('workspace cleanup runs once and attempts every disposer when one fails', () => {
  const { options, events } = createOptions({
    dispose: [
      () => { events.push('first'); throw Error('cleanup failed'); },
      () => events.push('second')
    ]
  });
  const dispose = mountWorkspaceSession(options);
  assert.throws(dispose, /cleanup failed/);
  dispose();
  assert.deepEqual(events.slice(-2), ['first', 'second']);
});

test('startup failure disposes mounted workspace resources before rethrowing', () => {
  const { options, events } = createOptions({
    render: () => { events.push('render'); throw Error('render failed'); },
    dispose: [() => events.push('disposed')]
  });
  assert.throws(() => mountWorkspaceSession(options), /render failed/);
  assert.deepEqual(events, ['theme:system', 'render', 'disposed']);
});
