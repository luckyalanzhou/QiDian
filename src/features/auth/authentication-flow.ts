import { reactive } from 'vue';
import type { AuthConfig } from '../../api/contracts';
import type { VaultData } from '../../api/contracts';

export type AuthMode = 'login' | 'register';
export type AuthenticatedResult = { data: VaultData; mfaRequired?: false; [key: string]: unknown };
export type MfaRequiredResult = { id: string; mfaRequired: true; mfaToken: string };
export type AuthenticationResult = AuthenticatedResult | MfaRequiredResult;
export type AuthenticationRecovery = {
  username?: string;
  authenticate?: (username: string, password: string, onStage?: (stage: string) => void) => Promise<AuthenticationResult>;
  completeMfaLogin?: (token: string, code: string, onStage?: (stage: string) => void) => Promise<AuthenticatedResult>;
  onAuthenticated: (result: AuthenticatedResult) => void | Promise<void>;
};

export type AuthenticationFlowDependencies = {
  getAuthConfig: () => Promise<AuthConfig>;
  registerAccount: (username: string, password: string, onStage?: (stage: string) => void) => Promise<unknown>;
  loginAccount: (username: string, password: string, onStage?: (stage: string) => void) => Promise<AuthenticationResult>;
  completeMfaLogin?: (token: string, code: string, onStage?: (stage: string) => void) => Promise<AuthenticatedResult>;
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
    mfaToken: '',
    mfaCode: '',
    loading: false,
    succeeded: false,
    message: '',
    startupError: ''
  });

  function clearCredentials() {
    state.password = '';
    state.passwordConfirmation = '';
    state.mfaToken = '';
    state.mfaCode = '';
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

  function cancelMfaStep() {
    if (state.loading) return;
    state.mfaToken = '';
    state.mfaCode = '';
    state.message = '';
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
      let authenticated: AuthenticationResult;
      if (state.mode === 'register') {
        await dependencies.registerAccount(state.username.trim(), state.password, stage => {
          state.message = ({ derive: '正在安全计算密码…', register: '正在创建账号…' } as Record<string, string>)[stage] || '正在处理注册…';
        });
        state.message = '账号已创建，正在载入私人空间…';
        authenticated = await dependencies.bootstrap();
      } else if (state.mfaToken) {
        const completeMfa = state.recovery?.completeMfaLogin || dependencies.completeMfaLogin;
        if (!completeMfa) throw new Error('当前页面不支持两步验证，请刷新后重试');
        authenticated = await completeMfa(state.mfaToken, state.mfaCode.trim(), stage => {
          state.message = ({ mfa: '正在验证两步验证码…', load: '正在载入私人空间…' } as Record<string, string>)[stage] || '正在处理登录…';
        });
      } else {
        const authenticate = state.recovery?.authenticate || dependencies.loginAccount;
        authenticated = await authenticate(state.username.trim(), state.password, stage => {
          state.message = ({
            challenge: '正在连接验证服务…',
            derive: '正在安全计算登录凭据…',
            verify: '正在验证账号…',
            mfa: '正在验证两步验证码…',
            load: '正在载入私人空间…'
          } as Record<string, string>)[stage] || '正在处理登录…';
        });
      }

      if (authenticated.mfaRequired === true) {
        state.mfaToken = authenticated.mfaToken;
        state.mfaCode = '';
        state.password = '';
        state.message = '密码已验证。请输入验证器验证码，或使用一次性恢复码。';
        return;
      }

      state.succeeded = true;
      state.message = '验证成功，正在载入你的知识库…';
      if (state.recovery) {
        await state.recovery.onAuthenticated(authenticated);
        dependencies.onRecoveryComplete?.();
      } else await dependencies.onAuthenticated(authenticated);
      clearCredentials();
      state.visible = false;
    } catch (error) {
      state.succeeded = false;
      state.message = error instanceof Error ? error.message : '操作未完成，请重试';
    } finally {
      state.loading = false;
    }
  }

  return { state, show, setMode, showStartupError, cancelMfaStep, submit };
}
