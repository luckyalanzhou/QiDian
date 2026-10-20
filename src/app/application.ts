import { mountAuthenticationGate } from '../features/auth/mount-auth-gate';
import { bootstrapApplication } from '../features/auth/application-bootstrap';
import { bootstrap, getAuthConfig, loginAccount, registerAccount } from '../cloud';
import { launchWorkspace } from './workspace-composition.js';
import type { AuthConfig } from '../api/contracts';
import type { AuthenticationRecovery } from '../features/auth/authentication-flow';

export async function startApplication() {
  const root = document.querySelector<HTMLElement>('#loginGate');
  if (!root) throw new Error('找不到登录界面容器');

  let disposeWorkspace: (() => void) | undefined;
  const authenticationGate = mountAuthenticationGate(root, {
    getAuthConfig,
    registerAccount,
    loginAccount,
    bootstrap,
    onAuthenticated: session => {
      disposeWorkspace?.();
      disposeWorkspace = launchWorkspace(session, showAuthentication);
    }
  });
  const showAuthentication = (
    sessionConfig: AuthConfig | null = null,
    recovery: AuthenticationRecovery | null = null
  ) =>
    authenticationGate.show(sessionConfig, recovery);

  await bootstrapApplication({
    bootstrap,
    showAuthentication,
    showStartupError: error => authenticationGate.showStartupError(error),
    launchWorkspace: (session, showAuth) => {
      disposeWorkspace?.();
      disposeWorkspace = launchWorkspace(session, showAuth);
    }
  });
}
