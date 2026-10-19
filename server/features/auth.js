import {
  authorize, hashSession, normalizeUsername, sessionTokenFromCookie, setSessionCookie, throttleAuth
} from '../auth.js';
import { HttpError } from '../validation.js';
import * as authRepository from '../repositories/auth-repository.js';
import * as accountRepository from '../repositories/account-repository.js';
import { createAuthService } from '../application/auth-service.js';

const authService = createAuthService(authRepository, accountRepository);

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
      return json({ id: session.id, username: session.username, revision: session.revision, data: JSON.parse(session.data) }, 200, {}, 'authSession');
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
    return json({ id: result.id }, 200, { 'Set-Cookie': setSessionCookie(request, result.sessionToken) }, 'authVerification');
  }
  if (path === '/api/auth/logout' && request.method === 'POST') {
    await authService.logout(env.DB, sessionTokenFromCookie(request));
    return json({ ok: true }, 200, { 'Set-Cookie': setSessionCookie(request, '', true) }, 'authLogout');
  }
  return null;
}
