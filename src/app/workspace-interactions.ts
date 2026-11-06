import { mountWorkspaceInteractionRuntime } from '../features/lifecycle/workspace-interaction-runtime.ts';
import type { WorkspaceClickHandler } from '../features/navigation/workspace-click-router.ts';

type RuntimeDependencies = Parameters<typeof mountWorkspaceInteractionRuntime>[0];

type EventHandler = { handle: WorkspaceClickHandler };

export type WorkspaceInteractionDependencies = Omit<RuntimeDependencies, 'routeHandlers' | 'handleChange'> & {
  usesVueWorkspace: boolean;
  navigationEvents?: EventHandler | null;
  shellEvents?: EventHandler | null;
  contentEvents?: { handleClick: (target: EventTarget | null) => boolean | Promise<boolean> } | null;
  editorToolbarEvents?: {
    handleClick: (target: EventTarget | null) => boolean | Promise<boolean>;
    handleChange: (target: EventTarget | null) => void;
  } | null;
};

export function mountWorkspaceInteractions(dependencies: WorkspaceInteractionDependencies) {
  const {
    usesVueWorkspace,
    navigationEvents,
    editorToolbarEvents,
    shellEvents,
    contentEvents,
    ...runtimeDependencies
  } = dependencies;

  return mountWorkspaceInteractionRuntime({
    ...runtimeDependencies,
    routeHandlers: [
      ...(usesVueWorkspace || !navigationEvents ? [] : [(event: Event) => navigationEvents.handle(event)]),
      ...(editorToolbarEvents ? [(event: Event) => editorToolbarEvents.handleClick(event.target)] : []),
      ...(usesVueWorkspace || !shellEvents ? [] : [(event: Event) => shellEvents.handle(event)]),
      ...(contentEvents ? [(event: Event) => contentEvents.handleClick(event.target)] : [])
    ],
    handleChange: editorToolbarEvents ? target => editorToolbarEvents.handleChange(target) : null
  });
}
