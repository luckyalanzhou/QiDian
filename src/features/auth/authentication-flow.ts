import { reactive } from 'vue';
import type { AuthConfig } from '../../api/contracts';
import type { VaultData } from '../../api/contracts';

export type AuthMode = 'login' | 'register';
export type AuthenticatedResult = { data: VaultData; [key: string]: unknown };
export type AuthenticationRecovery = {
  username?: string;
  authenticate?: (username: string, password: string, onStage?: (stage: string) => void) => Promise<AuthenticatedResult>;
  onAuthenticated: (result: AuthenticatedResult) => void | Promise<void>;
};

export type AuthenticationFlowDependencies = {
  getAuthConfig: () => Promise<AuthConfig>;
  registerAccount: (username: string, password: string) => Promise<unknown>;
  loginAccount: (username: string, password: string, onStage?: (stage: string) => void) => Promise<AuthenticatedResult>;
  bootstrap: () => Promise<AuthenticatedResult>;
  onAuthenticated: (result: AuthenticatedResult) => void | Promise<void>;
  onRecoveryComplete?: () => void;
};

export function createAuthenticationFlow(dependencies: AuthenticationFlowDependencies) {
  const state = reactive({
    visible: true,
    mode: 'login' as AuthMode,
    registrationEnabled: false,
    setupRequired: false,
    recovery: null as AuthenticationRecovery | null,
    username: '',
    password: '',
    passwordConfirmation: '',
    loading: false,
    succeeded: false,
    message: '',
    startupError: ''
  });

  function clearCredentials() {
    state.password = '';
    state.passwordConfirmation = '';
  }

  async function show(sessionConfig: AuthConfig | null = null, recovery: AuthenticationRecovery | null = null) {
    state.visible = true;
    state.recovery = recovery;
    state.startupError = '';
    state.message = '';
    state.succeeded = false;
    state.loading = false;
    clearCredentials();

    let config = recovery ? { registrationEnabled: false, setupRequired: false } : sessionConfig;
    if (typeof config?.registrationEnabled !== 'boolean') {
      try {
        config = await dependencies.getAuthConfig();
      } catch (error) {
        showStartupError(error);
        return;
      }
    }

    state.registrationEnabled = !recovery && config.registrationEnabled;
    state.setupRequired = !recovery && config.setupRequired === true;
    state.mode = state.setupRequired ? 'register' : 'login';
    state.username = recovery?.username || (state.setupRequired ? 'admin' : '');
  }

  function setMode(mode: AuthMode) {
    if (state.loading || state.recovery) return;
    if (mode === 'register' && !state.registrationEnabled) return;
    state.mode = mode;
    state.message = '';
    state.succeeded = false;
    clearCredentials();
  }

  function showStartupError(error: unknown) {
    state.startupError = error instanceof Error ? error.message : '服务暂不可用，请稍后重试。';
    state.visible = true;
    state.loading = false;
  }

  async function submit() {
    if (state.loading || state.startupError || !state.visible) return;
    if (state.mode === 'register' && state.password !== state.passwordConfirmation) {
      state.succeeded = false;
      state.message = '两次输入的密码不一致';
      return;
    }

    state.loading = true;
    state.succeeded = false;
    state.message = state.mode === 'register' ? '正在安全创建账号…' : '正在连接验证服务…';
    try {
      let authenticated: AuthenticatedResult;
      if (state.mode === 'register') {
        await dependencies.registerAccount(state.username.trim(), state.password);
        state.message = '账号已创建，正在载入私人空间…';
        authenticated = await dependencies.bootstrap();
      } else {
        const authenticate = state.recovery?.authenticate || dependencies.loginAccount;
        authenticated = await authenticate(state.username.trim(), state.password, stage => {
          state.message = ({
            challenge: '正在连接验证服务…',
            derive: '正在安全计算登录凭据…',
            verify: '正在验证账号…',
            load: '正在载入私人空间…'
          } as Record<string, string>)[stage] || '正在处理登录…';
        });
      }

      state.succeeded = true;
      state.message = '验证成功，正在载入你的知识库…';
      if (state.recovery) {
        await state.recovery.onAuthenticated(authenticated);
        dependencies.onRecoveryComplete?.();
      } else await dependencies.onAuthenticated(authenticated);
      state.visible = false;
    } catch (error) {
      state.succeeded = false;
      state.message = error instanceof Error ? error.message : '操作未完成，请重试';
    } finally {
      state.loading = false;
    }
  }

  return { state, show, setMode, showStartupError, submit };
}
