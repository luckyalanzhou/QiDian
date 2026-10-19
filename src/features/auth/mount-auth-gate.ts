import { createApp } from 'vue';
import AuthGate from './AuthGate.vue';
import type { AuthenticationFlowDependencies, AuthenticationRecovery } from './authentication-flow';
import type { AuthConfig } from '../../api/contracts';

type AuthGateInstance = {
  show: (sessionConfig?: AuthConfig | null, recovery?: AuthenticationRecovery | null) => Promise<void>;
  showStartupError: (error: unknown) => void;
};

export function mountAuthenticationGate(root: HTMLElement, dependencies: AuthenticationFlowDependencies) {
  const host = root.closest<HTMLElement>('#loginGate');
  if (!host) throw new Error('找不到登录界面容器');
  const instance = createApp(AuthGate, {
    ...dependencies,
    onRecoveryComplete: () => {
      host.hidden = true;
      host.classList.remove('reauth');
    }
  }).mount(root) as unknown as AuthGateInstance;
  return {
    show(sessionConfig: AuthConfig | null = null, recovery: AuthenticationRecovery | null = null) {
      host.hidden = false;
      host.classList.toggle('reauth', !!recovery);
      return instance.show(sessionConfig, recovery);
    },
    showStartupError(error: unknown) {
      host.hidden = false;
      instance.showStartupError(error);
    }
  };
}
