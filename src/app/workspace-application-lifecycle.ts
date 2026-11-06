import { mountWorkspaceLifecycle } from '../features/lifecycle/workspace-lifecycle.ts';
import { mountWorkspaceSession } from '../features/lifecycle/workspace-session.ts';

type LifecycleDependencies = Parameters<typeof mountWorkspaceLifecycle>[0];
type SessionDependencies<Vault> = Omit<Parameters<typeof mountWorkspaceSession<Vault>>[0], 'dispose'>;

export function createWorkspaceApplicationLifecycle<Vault>(dependencies: {
  lifecycle: LifecycleDependencies;
}) {
  const disposeWorkspaceLifecycle = mountWorkspaceLifecycle(dependencies.lifecycle);

  return {
    startSession(options: {
      session: SessionDependencies<Vault>;
      dispose: {
        interactions: () => void;
        theme: () => void;
        clearAutosave: () => void;
        destroyEditor: () => void;
        history: () => void;
        readerFragmentRestoration: () => void;
        skipToMainContent: () => void;
      };
    }) {
      const { dispose } = options;
      return mountWorkspaceSession({
        ...options.session,
        dispose: [
          dispose.interactions,
          disposeWorkspaceLifecycle,
          dispose.theme,
          dispose.clearAutosave,
          dispose.destroyEditor,
          dispose.history,
          dispose.readerFragmentRestoration,
          dispose.skipToMainContent
        ]
      });
    }
  };
}
