import type { AuthConfig } from '../../api/contracts';
import type { AuthenticatedResult, AuthenticationRecovery } from './authentication-flow';

export type SessionRecoveryResult = AuthenticatedResult & { conflict?: boolean };

export type SessionRecoveryFlowDependencies = {
  subscribe: (listener: () => void) => void;
  showAuthentication: (config: AuthConfig | null, recovery: AuthenticationRecovery) => Promise<unknown>;
  authenticate: NonNullable<AuthenticationRecovery['authenticate']>;
  completeMfaLogin: NonNullable<AuthenticationRecovery['completeMfaLogin']>;
  username: string;
  applyAuthenticated: (result: SessionRecoveryResult) => void;
  notify: (message: string) => void;
};

export function connectSessionRecoveryFlow(dependencies: SessionRecoveryFlowDependencies) {
  let promptOpen = false;

  function handleAuthenticationRequired() {
    if (promptOpen) return;
    promptOpen = true;

    const recovery: AuthenticationRecovery = {
      authenticate: dependencies.authenticate,
      completeMfaLogin: dependencies.completeMfaLogin,
      username: dependencies.username,
      onAuthenticated: result => {
        promptOpen = false;
        if (result.conflict) return;
        dependencies.applyAuthenticated(result);
      }
    };

    try {
      void dependencies.showAuthentication(null, recovery).catch(error => {
        promptOpen = false;
        dependencies.notify(error instanceof Error ? error.message : '重新登录窗口无法打开');
      });
    } catch (error) {
      promptOpen = false;
      dependencies.notify(error instanceof Error ? error.message : '重新登录窗口无法打开');
    }
  }

  dependencies.subscribe(handleAuthenticationRequired);
  return { handleAuthenticationRequired, isPromptOpen: () => promptOpen };
}
