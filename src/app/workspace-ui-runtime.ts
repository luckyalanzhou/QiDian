import { observeReaderFragmentRestoration } from '../features/reader/body-fragment-navigation.ts';
import { createWorkspaceHistory } from './workspace-history.ts';
import { mountWorkspaceInteractions } from './workspace-interactions.ts';

type HistoryDependencies = Parameters<typeof createWorkspaceHistory>[0];
type InteractionDependencies = Parameters<typeof mountWorkspaceInteractions>[0];

export function mountWorkspaceUIRuntime(dependencies: {
  history: HistoryDependencies;
  readerFragmentRoot: HTMLElement | null;
  interactions: InteractionDependencies;
}) {
  const history = createWorkspaceHistory(dependencies.history);
  const disposeReaderFragmentRestoration = observeReaderFragmentRestoration(dependencies.readerFragmentRoot);
  const disposeInteractions = mountWorkspaceInteractions(dependencies.interactions);

  return {
    history,
    disposeInteractions,
    disposeReaderFragmentRestoration,
    disposeHistory: history.dispose
  };
}
