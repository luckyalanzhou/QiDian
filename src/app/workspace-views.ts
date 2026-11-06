import { createLegacyWorkspaceRenderer } from '../compat/navigation/legacy-workspace-renderer.js';
import { createLegacyWorkspaceViewPresentation } from '../compat/navigation/legacy-workspace-view-presentation.ts';
import { createVueWorkspaceViewPresentation } from '../features/navigation/vue-workspace-view-presentation.ts';
import { createWorkspaceViewDispatcher } from '../features/navigation/workspace-view-dispatcher.ts';

type LegacyRendererDependencies = Omit<Parameters<typeof createLegacyWorkspaceRenderer>[0], 'enabled'>;
type LegacyPresentationDependencies = Omit<
  Parameters<typeof createLegacyWorkspaceViewPresentation>[0],
  'renderDashboard' | 'renderHome' | 'renderReader'
>;
type ViewDispatcherDependencies = Omit<
  Parameters<typeof createWorkspaceViewDispatcher>[0],
  'presentation' | 'renderSidebar'
>;

type WorkspaceViewFeatureDependencies = {
  usesVueWorkspace: boolean;
  legacyRenderer: LegacyRendererDependencies;
  vuePresentation: Parameters<typeof createVueWorkspaceViewPresentation>[0];
  legacyPresentation: LegacyPresentationDependencies;
  dispatcher: ViewDispatcherDependencies;
};

export function createWorkspaceViewFeature(dependencies: WorkspaceViewFeatureDependencies) {
  const legacyRenderer = dependencies.usesVueWorkspace
    ? null
    : createLegacyWorkspaceRenderer({ ...dependencies.legacyRenderer, enabled: false });
  const presentation = dependencies.usesVueWorkspace
    ? createVueWorkspaceViewPresentation(dependencies.vuePresentation)
    : createLegacyWorkspaceViewPresentation({
      ...dependencies.legacyPresentation,
      renderDashboard: () => legacyRenderer?.renderDashboard(),
      renderHome: () => legacyRenderer?.renderHome(),
      renderReader: () => legacyRenderer?.renderReader()
    });
  const dispatcher = createWorkspaceViewDispatcher({
    ...dependencies.dispatcher,
    presentation,
    renderSidebar: () => legacyRenderer?.renderSidebar()
  });

  return { legacyRenderer, render: () => dispatcher.render() };
}
