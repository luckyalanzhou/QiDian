import { createSystemUpdateController } from '../features/system-updates/controller.ts';

type ControllerDependencies = Parameters<typeof createSystemUpdateController>[0];

export type WorkspaceSystemUpdateDependencies = Omit<ControllerDependencies, 'onDialogOpen' | 'onDialogClose'> & {
  onDialogOpen: NonNullable<ControllerDependencies['onDialogOpen']>;
  onDialogClose: NonNullable<ControllerDependencies['onDialogClose']>;
};

export function createWorkspaceSystemUpdates(dependencies: WorkspaceSystemUpdateDependencies) {
  return createSystemUpdateController(dependencies);
}
