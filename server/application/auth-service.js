import {
  PASSWORD_ITERATIONS, SESSION_IDLE_TTL, base64ToBytes, dummyPasswordHash, equalBase64ConstantTime,
  hashPasswordVerifier, hashSession, newSessionToken, normalizeUsername, randomBase64
} from '../auth.js';
import { HttpError, validateVault } from '../validation.js';
import { vaultToRecords } from './vault-records.mjs';
import { decryptTotpSecret, hashRecoveryCode, verifyTotpCode } from '../totp.js';

/** Coordinates registration and password-challenge use cases without HTTP objects. */
export function createAuthService(repository, accounts, {
  now = Date.now,
  totpRepository = repository,
  createId = () => crypto.randomUUID(),
  derivePasswordHash = hashPasswordVerifier,
  deriveSessionHash = hashSession,
  createSessionToken = newSessionToken,
  createMfaToken = newSessionToken,
  createSalt = randomBase64,
  comparePasswordHash = equalBase64ConstantTime,
  fallbackPasswordHash = dummyPasswordHash
} = {}) {
  function isEmptyLegacyVault({ vault, snapshotCount, assetCount }) {
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
    const legacyData = claim && !claim.claimed_by ? await repository.findLegacyDataForFirstOwner(db) : null;
    if (claim && !claim.claimed_by && !policy.localDev) {
      const freshInstall = policy.selfHosted && isEmptyLegacyVault(legacyData);
      if (!freshInstall) throw new HttpError(409, '旧笔记库尚未完成首次认领，请联系管理员后再开放注册');
    }

    const defaultRecords = vaultToRecords(validateVault({ categories: [], notes: [] }));
    const records = legacyData?.vault?.data
      ? vaultToRecords(validateVault(JSON.parse(legacyData.vault.data))) : defaultRecords;

    const passwordHash = await derivePasswordHash(input.verifier);
    const created = now(), accountId = createId(), rawToken = createSessionToken();
    const tokenHash = await deriveSessionHash(rawToken);
    try {
      const result = await repository.createRegisteredAccount(db, {
        accountId, username, salt: input.salt, passwordHash, iterations: PASSWORD_ITERATIONS,
        tokenHash, now: created, sessionExpires: created + SESSION_IDLE_TTL,
        registrationEnabled: policy.registrationEnabled, records, defaultRecords
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

    if (Number(account.totp_enabled) === 1) {
      const mfaToken = createMfaToken();
      const created = now();
      const challengeResult = await repository.createMfaChallenge(db, {
        tokenHash: await deriveSessionHash(mfaToken), accountId: account.id,
        created, expires: created + 5 * 60 * 1000
      });
      if (challengeResult?.meta?.changes !== 1) throw new HttpError(401, '账号或密码不正确，请重试');
      return { id: account.id, mfaRequired: true, mfaToken };
    }

    const sessionToken = createSessionToken(), created = now();
    await repository.createSession(db, {
      tokenHash: await deriveSessionHash(sessionToken), accountId: challenge.account_id,
      created, expires: created + SESSION_IDLE_TTL
    });
    return { id: account.id, sessionToken };
  }

  async function mfaChallengeIdentity(db, token) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 128) return null;
    const challenge = await totpRepository.findMfaChallenge(db, await deriveSessionHash(token), now());
    return challenge?.account_id || null;
  }

  async function verifyMfaChallenge(db, { token, code }, encryptionKey) {
    if (typeof token !== 'string' || token.length < 20 || token.length > 128
        || typeof code !== 'string' || code.length > 64) {
      throw new HttpError(401, '验证码无效或已过期，请重新登录');
    }
    const current = now(), tokenHash = await deriveSessionHash(token);
    const challenge = await totpRepository.findMfaChallenge(db, tokenHash, current);
    if (!challenge) throw new HttpError(401, '验证码无效或已过期，请重新登录');
    const totp = await totpRepository.findTotpState(db, challenge.account_id);
    if (!totp || Number(totp.enabled) !== 1) throw new HttpError(401, '验证码无效或已过期，请重新登录');

    const sessionToken = createSessionToken(), created = current;
    const session = {
      tokenHash: await deriveSessionHash(sessionToken), accountId: challenge.account_id,
      created, expires: created + SESSION_IDLE_TTL
    };
    const recoveryHash = hashRecoveryCode(code);
    let results;
    if (recoveryHash) {
      results = await totpRepository.consumeRecoveryChallenge(db, {
        tokenHash, accountId: challenge.account_id, codeHash: recoveryHash,
        sessionTokenHash: session.tokenHash, created, expires: session.expires, now: current
      });
    } else {
      if (!encryptionKey) throw new HttpError(503, '两步验证密钥不可用；请联系设备管理员恢复账号');
      let secret;
      try {
        secret = decryptTotpSecret({
          iv: totp.secret_iv, ciphertext: totp.secret_ciphertext, tag: totp.secret_tag
        }, encryptionKey);
      } catch {
        throw new HttpError(503, '两步验证密钥不可用；请联系设备管理员恢复账号');
      }
      const counter = verifyTotpCode(secret, code, current, Number(totp.last_counter));
      if (counter === null) throw new HttpError(401, '验证码无效或已过期，请重新登录');
      results = await totpRepository.consumeTotpChallenge(db, {
        tokenHash, accountId: challenge.account_id, counter,
        sessionTokenHash: session.tokenHash, created, expires: session.expires, now: current
      });
    }
    if (results?.[1]?.meta?.changes !== 1) throw new HttpError(401, '验证码无效或已过期，请重新登录');
    return { id: challenge.account_id, sessionToken };
  }

  async function logout(db, sessionToken) {
    if (sessionToken) await repository.deleteSession(db, await deriveSessionHash(sessionToken));
    return { ok: true };
  }

  return { registrationState, register, createChallenge, verifyChallenge, mfaChallengeIdentity, verifyMfaChallenge, logout };
}
