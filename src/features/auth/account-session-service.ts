import type { AuthSession } from '../../api/contracts';

export type RegistrationCredential = { salt: string; verifier: string; iterations: number };
export type LoginChallenge = { id: string; salt: string };
export type AccountSession = AuthSession;
export type MfaRequiredLogin = { id: string; mfaRequired: true; mfaToken: string };
export type AccountLoginResult = AccountSession | MfaRequiredLogin;

export type AccountSessionServiceDependencies = {
  makeRegistrationCredential: (password: string) => Promise<RegistrationCredential>;
  makeLoginVerifier: (password: string, salt: string) => Promise<string>;
  registerWithCredential: (username: string, credential: RegistrationCredential) => Promise<{ id: string; legacyClaimed?: boolean }>;
  readLegacyDraft: () => Promise<{ pending?: boolean; [key: string]: unknown } | null>;
  storeAccountDraft: (draft: Record<string, unknown>, owner: string) => Promise<unknown>;
  requestLoginChallenge: (username: string) => Promise<LoginChallenge>;
  verifyLoginChallenge: (challengeId: string, verifier: string) => Promise<{ id: string; mfaRequired?: true; mfaToken?: string }>;
  verifyMfaChallenge: (token: string, code: string) => Promise<{ id: string }>;
  getAuthSession: () => Promise<AccountSession>;
  getPasswordSalt: () => Promise<{ salt: string }>;
  updateAccountPassword: (input: { currentVerifier: string } & RegistrationCredential) => Promise<unknown>;
};

export function createAccountSessionService(dependencies: AccountSessionServiceDependencies) {
  async function registerAccount(username: string, password: string, onStage: (stage: string) => void = () => undefined) {
    onStage('derive');
    const credential = await dependencies.makeRegistrationCredential(password);
    onStage('register');
    const result = await dependencies.registerWithCredential(username, credential);
    if (result.legacyClaimed) {
      const legacy = await dependencies.readLegacyDraft().catch(() => null);
      if (legacy?.pending) await dependencies.storeAccountDraft({ ...legacy, owner: result.id }, result.id);
    }
    return result;
  }

  async function verifyAccount(username: string, password: string, onStage: (stage: string) => void = () => undefined) {
    onStage('challenge');
    const challenge = await dependencies.requestLoginChallenge(username);
    onStage('derive');
    const verifier = await dependencies.makeLoginVerifier(password, challenge.salt);
    onStage('verify');
    const verified = await dependencies.verifyLoginChallenge(challenge.id, verifier);
    if (verified.mfaRequired === true && typeof verified.mfaToken === 'string') {
      return { id: verified.id, mfaRequired: true as const, mfaToken: verified.mfaToken };
    }
    return loadVerifiedSession(verified.id, onStage);
  }

  async function completeMfaLogin(token: string, code: string, onStage: (stage: string) => void = () => undefined) {
    onStage('mfa');
    const verified = await dependencies.verifyMfaChallenge(token, code);
    return loadVerifiedSession(verified.id, onStage);
  }

  async function loadVerifiedSession(expectedId: string, onStage: (stage: string) => void) {
    onStage('load');
    let session: AccountSession;
    try {
      session = await dependencies.getAuthSession();
    } catch (error) {
      const status = error && typeof error === 'object' ? (error as { status?: number }).status : undefined;
      if (status === 401) {
        throw new Error('密码验证成功，但浏览器没有建立登录会话。请允许本站 Cookie，并确认访问地址与 HTTP / HTTPS 代理设置一致。');
      }
      throw error;
    }
    if (session.id !== expectedId) throw new Error('登录会话与当前账号不一致，请重新登录');
    return session;
  }

  async function changeAccountPassword(currentPassword: string, newPassword: string) {
    const credential = await dependencies.getPasswordSalt();
    const [currentVerifier, next] = await Promise.all([
      dependencies.makeLoginVerifier(currentPassword, credential.salt),
      dependencies.makeRegistrationCredential(newPassword)
    ]);
    return dependencies.updateAccountPassword({ currentVerifier, ...next });
  }

  return { registerAccount, verifyAccount, completeMfaLogin, changeAccountPassword };
}
