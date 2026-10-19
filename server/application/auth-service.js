import {
  PASSWORD_ITERATIONS, SESSION_IDLE_TTL, base64ToBytes, dummyPasswordHash, equalBase64ConstantTime,
  hashPasswordVerifier, hashSession, newSessionToken, normalizeUsername, randomBase64
} from '../auth.js';
import { HttpError } from '../validation.js';

/** Coordinates registration and password-challenge use cases without HTTP objects. */
export function createAuthService(repository, accounts, {
  now = Date.now,
  createId = () => crypto.randomUUID(),
  derivePasswordHash = hashPasswordVerifier,
  deriveSessionHash = hashSession,
  createSessionToken = newSessionToken,
  createSalt = randomBase64,
  comparePasswordHash = equalBase64ConstantTime,
  fallbackPasswordHash = dummyPasswordHash
} = {}) {
  async function isEmptyLegacyVault(db) {
    const { vault, snapshotCount, assetCount } = await repository.findLegacyDataForFirstOwner(db);
    if (!vault || vault.revision !== 0 || snapshotCount || assetCount) return false;
    try {
      const data = JSON.parse(vault.data);
      return Array.isArray(data.notes) && data.notes.length === 0
        && Array.isArray(data.categories) && data.categories.length === 0
        && data.theme === 'light' && data.pasteMode === 'rich';
    } catch { return false; }
  }

  async function registrationState(db, { registrationEnabled = false, selfHosted = false } = {}) {
    const ownerExists = !!(await accounts.findFirstAccount(db));
    const setupRequired = selfHosted && !ownerExists;
    // A fresh private self-hosted install always permits exactly the first owner.
    // Further signups require the deployment administrator to opt in.
    return { registrationEnabled: registrationEnabled || setupRequired, setupRequired };
  }

  async function register(db, input, policy = {}) {
    const state = await registrationState(db, policy);
    if (!state.registrationEnabled) throw new HttpError(403, '当前未开放注册');
    const username = normalizeUsername(input?.username);
    if (input?.iterations !== PASSWORD_ITERATIONS) throw new HttpError(400, '密码派生参数无效，请刷新后重试');
    base64ToBytes(input.salt, 16);
    base64ToBytes(input.verifier, 32);

    const existing = await repository.findRegistrationName(db, username);
    if (existing.results.some(row => row.username_normalized === username)) throw new HttpError(409, '账号名称已被使用');
    const claim = await repository.findLegacyClaim(db);
    if (claim && !claim.claimed_by && !policy.localDev) {
      const freshInstall = policy.selfHosted && await isEmptyLegacyVault(db);
      if (!freshInstall) throw new HttpError(409, '旧笔记库尚未完成首次认领，请联系管理员后再开放注册');
    }

    const passwordHash = await derivePasswordHash(input.verifier);
    const created = now(), accountId = createId(), rawToken = createSessionToken();
    const tokenHash = await deriveSessionHash(rawToken);
    try {
      const result = await repository.createRegisteredAccount(db, {
        accountId, username, salt: input.salt, passwordHash, iterations: PASSWORD_ITERATIONS,
        tokenHash, now: created, sessionExpires: created + SESSION_IDLE_TTL,
        registrationEnabled: policy.registrationEnabled
      });
      if (result[0]?.meta?.changes !== 1) throw new HttpError(409, '账号创建失败，请更换账号或稍后再试');
      return { id: accountId, username, legacyClaimed: result[1]?.meta?.changes === 1, sessionToken: rawToken };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (/UNIQUE|constraint failed/i.test(String(error))) throw new HttpError(409, '注册未完成，请更换账号或稍后再试');
      throw error;
    }
  }

  async function createChallenge(db, username) {
    username = normalizeUsername(username);
    const account = await repository.findAccountByNormalizedUsername(db, username);
    const normalizedUsername = account?.username_normalized || username;
    const id = createId(), salt = account?.password_salt || await createSalt(16), created = now();
    await repository.createAuthChallenge(db, {
      id, accountId: account?.id || null, username: normalizedUsername,
      salt, created, expires: created + 5 * 60 * 1000
    });
    return { id, salt, iterations: PASSWORD_ITERATIONS };
  }

  async function verifyChallenge(db, { id, verifier }) {
    const current = now();
    const challenge = await repository.findAuthChallenge(db, id, current);
    if (!challenge) throw new HttpError(401, '账号或密码不正确，请重试');
    const consumed = await repository.consumeAuthChallenge(db, id, current);
    if (consumed.meta.changes !== 1) throw new HttpError(401, '账号或密码不正确，请重试');

    let account = null, passwordHash = fallbackPasswordHash(), validPassword = false;
    if (challenge.account_id) {
      account = await repository.findChallengeAccount(db, challenge.account_id);
      if (account) passwordHash = account.password_hash;
    }
    try { validPassword = comparePasswordHash(passwordHash, await derivePasswordHash(verifier)); } catch { validPassword = false; }
    if (!challenge.account_id || !account || !validPassword) throw new HttpError(401, '账号或密码不正确，请重试');
    if (!await repository.hasAccountVault(db, challenge.account_id)) throw new HttpError(404, '账号知识库不存在');

    const sessionToken = createSessionToken(), created = now();
    await repository.createSession(db, {
      tokenHash: await deriveSessionHash(sessionToken), accountId: challenge.account_id,
      created, expires: created + SESSION_IDLE_TTL
    });
    return { id: account.id, sessionToken };
  }

  async function logout(db, sessionToken) {
    if (sessionToken) await repository.deleteSession(db, await deriveSessionHash(sessionToken));
    return { ok: true };
  }

  return { registrationState, register, createChallenge, verifyChallenge, logout };
}
