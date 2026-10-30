import {
  authorize, hashSession, normalizeUsername, sessionTokenFromCookie, setSessionCookie, throttleAuth
} from '../auth.js';
import { HttpError, validateVault } from '../validation.js';
import * as authRepository from '../repositories/auth-repository.js';
import * as accountRepository from '../repositories/account-repository.js';
import * as vaultRepository from '../repositories/vault-repository.js';
import { createAuthService } from '../application/auth-service.js';
import * as totpRepository from '../repositories/totp-repository.js';
import { hashRecoveryCode } from '../totp.js';

const authService = createAuthService(authRepository, accountRepository, { totpRepository });

async function readTotpEncryptionKey(env) {
  try {
    const key = await env.getTotpEncryptionKey?.();
    if (!key || Buffer.from(key).length !== 32) throw new Error('missing or invalid');
    return key;
  } catch {
    throw new HttpError(503, '两步验证密钥不可用；请联系设备管理员恢复账号');
  }
}

function registrationPolicy(env) {
  return {
    registrationEnabled: env.REGISTRATION_ENABLED === 'true',
    selfHosted: env.SELF_HOSTED === 'true',
    localDev: env.LOCAL_DEV === 'true'
  };
}

export async function handleAuthRoute({ request, env, path, json, readJson }) {
  if (!env.DB) throw new HttpError(503, '尚未配置数据库');
  if (path === '/api/auth/config' && request.method === 'GET') {
    return json(await authService.registrationState(env.DB, registrationPolicy(env)), 200, {}, 'authConfig');
  }
  if (path === '/api/auth/session' && request.method === 'GET') {
    try {
      const session = await authorize(request, env, true);
      const vault = await vaultRepository.findVault(env.DB, session.id);
      if (!vault) throw new HttpError(404, '账号知识库不存在');
      return json({ id: session.id, username: session.username, revision: vault.revision, data: validateVault(JSON.parse(vault.data)) }, 200, {}, 'authSession');
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        return json({ error: error.message, ...await authService.registrationState(env.DB, registrationPolicy(env)) }, 401);
      }
      throw error;
    }
  }
  if (path === '/api/auth/register' && request.method === 'POST') {
    if (!(await authService.registrationState(env.DB, registrationPolicy(env))).registrationEnabled) {
      throw new HttpError(403, '当前未开放注册');
    }
    const input = await readJson(request, 4096, 'registrationRequest');
    const username = normalizeUsername(input.username);
    await throttleAuth(env, request, 'register', username, { ipLimit: 12, identityLimit: 6, windowMs: 60 * 60 * 1000 });
    const result = await authService.register(env.DB, { ...input, username }, registrationPolicy(env));
    return json({ id: result.id, username: result.username, legacyClaimed: result.legacyClaimed }, 201,
      { 'Set-Cookie': setSessionCookie(request, result.sessionToken) }, 'registration');
  }
  if (path === '/api/auth/challenge' && request.method === 'POST') {
    const input = await readJson(request, 2048, 'authChallengeRequest'), username = normalizeUsername(input.username);
    await throttleAuth(env, request, 'challenge', username, { ipLimit: 30, identityLimit: 10, windowMs: 10 * 60 * 1000 });
    return json(await authService.createChallenge(env.DB, username), 200, {}, 'authChallenge');
  }
  if (path === '/api/auth/verify' && request.method === 'POST') {
    const input = await readJson(request, 2048, 'authVerificationRequest');
    await throttleAuth(env, request, 'verify', String(input.id || '').slice(0, 80), { ipLimit: 30, identityLimit: 30, windowMs: 10 * 60 * 1000 });
    const result = await authService.verifyChallenge(env.DB, input);
    if (result.mfaRequired) return json({ id: result.id, mfaRequired: true, mfaToken: result.mfaToken }, 200, {}, 'authVerification');
    return json({ id: result.id }, 200, { 'Set-Cookie': setSessionCookie(request, result.sessionToken) }, 'authVerification');
  }
  if (path === '/api/auth/mfa-verify' && request.method === 'POST') {
    const input = await readJson(request, 2048, 'authMfaVerificationRequest');
    const accountId = await authService.mfaChallengeIdentity(env.DB, input.token);
    await throttleAuth(env, request, 'mfa-verify', accountId || 'invalid-challenge', {
      ipLimit: 30, identityLimit: 10, windowMs: 10 * 60 * 1000
    });
    const key = hashRecoveryCode(input.code) ? undefined : await readTotpEncryptionKey(env);
    const result = await authService.verifyMfaChallenge(env.DB, input, key);
    return json({ id: result.id }, 200, { 'Set-Cookie': setSessionCookie(request, result.sessionToken) }, 'authMfaVerification');
  }
  if (path === '/api/auth/logout' && request.method === 'POST') {
    await authService.logout(env.DB, sessionTokenFromCookie(request));
    return json({ ok: true }, 200, { 'Set-Cookie': setSessionCookie(request, '', true) }, 'authLogout');
  }
  return null;
}
