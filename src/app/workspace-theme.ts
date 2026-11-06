import { createThemeController } from '../features/appearance/theme-controller.ts';

type ThemeControllerDependencies = Parameters<typeof createThemeController>[0];

export type WorkspaceThemeDependencies = Omit<ThemeControllerDependencies, 'getPreference' | 'setPreference'> & {
  getThemePreference: ThemeControllerDependencies['getPreference'];
  updateThemePreference: ThemeControllerDependencies['setPreference'];
};

export function createWorkspaceTheme(dependencies: WorkspaceThemeDependencies) {
  const { getThemePreference, updateThemePreference, ...controllerDependencies } = dependencies;
  return createThemeController({
    ...controllerDependencies,
    getPreference: getThemePreference,
    setPreference: updateThemePreference
  });
}
