import { createApp, nextTick } from 'vue';
import AuthGate from './AuthGate.vue';
import { createAuthRecoveryModal } from './auth-recovery-modal';
import { revealAuthenticationGate } from './reveal-authentication-gate';
import type { AuthenticationFlowDependencies, AuthenticationRecovery } from './authentication-flow';
import type { AuthConfig } from '../../api/contracts';

type AuthGateInstance = {
  show: (sessionConfig?: AuthConfig | null, recovery?: AuthenticationRecovery | null) => Promise<void>;
  showStartupError: (error: unknown) => void;
};

export function mountAuthenticationGate(root: HTMLElement, dependencies: AuthenticationFlowDependencies) {
  const host = root.closest<HTMLElement>('#loginGate');
  if (!host) throw new Error('找不到登录界面容器');
  const recoveryModal = createAuthRecoveryModal(root.ownerDocument, host, root.ownerDocument.querySelector<HTMLElement>('.app'));
  const instance = createApp(AuthGate, {
    ...dependencies,
    onRecoveryComplete: () => {
      recoveryModal.deactivate();
    }
  }).mount(root) as unknown as AuthGateInstance;
  return {
    async show(sessionConfig: AuthConfig | null = null, recovery: AuthenticationRecovery | null = null) {
      if (recovery) recoveryModal.activate();
      else {
        revealAuthenticationGate(root.ownerDocument, host);
        host.classList.remove('reauth');
      }
      await instance.show(sessionConfig, recovery);
      if (recovery) {
        await nextTick();
        recoveryModal.focus();
      }
    },
    showStartupError(error: unknown) {
      revealAuthenticationGate(root.ownerDocument, host);
      instance.showStartupError(error);
    }
  };
}
