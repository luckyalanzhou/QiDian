import { createMobileMenuFocusController } from '../features/navigation/mobile-menu-focus-controller.ts';
import { createWorkspaceNavigationActions, type WorkspaceNavigationActionDependencies } from '../features/navigation/workspace-navigation-actions.ts';
import { createWorkspaceNavigationController } from '../features/navigation/workspace-navigation-controller.ts';
import { createWorkspaceNavigationEventsForMode } from '../features/navigation/workspace-navigation-events.ts';

type WorkspaceNavigationFeatureDependencies = {
  focus: Parameters<typeof createMobileMenuFocusController>[0];
  navigation: Omit<Parameters<typeof createWorkspaceNavigationController>[0], 'closeMenu' | 'restoreNoteFocus'>;
  actions: Omit<WorkspaceNavigationActionDependencies, 'navigation'>;
  vueMounted: boolean;
};

export function createWorkspaceNavigationFeature(dependencies: WorkspaceNavigationFeatureDependencies) {
  const mobileMenuFocusController = createMobileMenuFocusController(dependencies.focus);
  function restoreNoteFocus(noteId: string) {
    void Promise.resolve().then(() => dependencies.focus.scheduleFocus(() => {
      const document = dependencies.focus.document;
      const card = [...document.querySelectorAll<HTMLElement>('[data-open]')]
        .find(element => element.getAttribute('data-open') === noteId);
      (card || document.querySelector<HTMLElement>('#notePageSearch') || document.querySelector<HTMLElement>('#searchTop'))
        ?.focus({ preventScroll: true });
    }));
  }

  const navigation = createWorkspaceNavigationController({
    ...dependencies.navigation,
    closeMenu: () => mobileMenuFocusController.close(),
    restoreNoteFocus
  });
  const actions = createWorkspaceNavigationActions({ ...dependencies.actions, navigation });
  const events = createWorkspaceNavigationEventsForMode(dependencies.vueMounted, { execute: actions.execute });

  return { mobileMenuFocusController, navigation, actions, events };
}
