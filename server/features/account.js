import {
  hashSession, sessionTokenFromCookie, throttleAuth
} from '../auth.js';
import { HttpError } from '../validation.js';
import * as accountRepository from '../repositories/account-repository.js';
import { createAccountService } from '../application/account-service.js';
import { createTotpService } from '../application/totp-service.js';
import * as totpRepository from '../repositories/totp-repository.js';
import { hashRecoveryCode } from '../totp.js';
import { createExtensionService, assertSecureExtensionInstance } from '../application/extension-service.js';
import * as extensionRepository from '../repositories/extension-repository.js';
import * as vaultRepository from '../repositories/vault-repository.js';

const MAX_AVATAR_BYTES = 512 * 1024;
const accountService = createAccountService(accountRepository);
const totpService = createTotpService(totpRepository, accountRepository);
const extensionService = createExtensionService(extensionRepository, vaultRepository);

async function readTotpKey(env) {
  try {
    const key = await env.getTotpEncryptionKey?.();
    if (!key) throw new Error('missing');
    return key;
  } catch {
    throw new HttpError(503, '两步验证密钥不可用；请联系设备管理员恢复账号');
  }
}

async function readLimitedBytes(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '请求内容为空');
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, '文件大小超过限制');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function sniffAvatarMime(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  throw new HttpError(415, '头像只支持 PNG、JPEG 或 WebP 图片');
}

/** Handles profile, avatar and password operations for the authorized account. */
export async function handleAccountRoute({ request, env, accountId, path, json, headers, readJson }) {
  if (path === '/api/account/extensions/pairing' && request.method === 'POST') {
    assertSecureExtensionInstance(request);
    const input = await readJson(request, 2048, 'extensionPairingCodeRequest');
    await throttleAuth(env, request, 'extension-pairing-issue', accountId, {
      ipLimit: 10, identityLimit: 5, windowMs: 60 * 60 * 1000
    });
    return json(await extensionService.issuePairing(env.DB, accountId, input.name), 200, {}, 'extensionPairingCode');
  }

  if (path === '/api/account/extensions/tokens' && request.method === 'GET') {
    return json({ tokens: await extensionService.listTokens(env.DB, accountId) }, 200, {}, 'extensionTokens');
  }

  const revokeToken = /^\/api\/account\/extensions\/tokens\/([a-f0-9-]{36})$/i.exec(path);
  if (revokeToken && request.method === 'DELETE') {
    return json(await extensionService.revokeToken(env.DB, accountId, revokeToken[1]), 200, {}, 'extensionTokenMutation');
  }

  if (path === '/api/account/profile' && request.method === 'GET') {
    return json(await accountService.readProfile(env.DB, accountId), 200, {}, 'accountProfile');
  }

  if (path === '/api/account/avatar' && request.method === 'GET') {
    const avatar = await accountService.readAvatar(env.DB, accountId);
    return new Response(avatar.bytes, { headers: { ...headers, 'Cache-Control': 'private, no-store', 'Content-Type': avatar.mime,
      'Content-Security-Policy': "default-src 'none'; sandbox" } });
  }

  if (path === '/api/account/avatar' && request.method === 'PUT') {
    const bytes = await readLimitedBytes(request, MAX_AVATAR_BYTES), mime = sniffAvatarMime(bytes);
    return json(await accountService.saveAvatar(env.DB, accountId, bytes.buffer, mime), 200, {}, 'accountAvatarMutation');
  }

  if (path === '/api/account/avatar' && request.method === 'DELETE') {
    return json(await accountService.clearAvatar(env.DB, accountId), 200, {}, 'accountAvatarMutation');
  }

  if (path === '/api/account/totp/enrollment' && request.method === 'POST') {
    const input = await readJson(request, 2048, 'totpEnrollmentRequest');
    await throttleAuth(env, request, 'totp-enrollment', accountId, { ipLimit: 10, identityLimit: 5, windowMs: 60 * 60 * 1000 });
    return json(await totpService.beginEnrollment(env.DB, accountId, input, await readTotpKey(env)), 200, {}, 'totpEnrollment');
  }

  if (path === '/api/account/totp/confirm' && request.method === 'POST') {
    const input = await readJson(request, 2048, 'totpConfirmRequest');
    await throttleAuth(env, request, 'totp-confirm', accountId, { ipLimit: 10, identityLimit: 5, windowMs: 60 * 60 * 1000 });
    return json(await totpService.confirmEnrollment(env.DB, accountId, input, await readTotpKey(env)), 200, {}, 'totpEnabled');
  }

  if (path === '/api/account/totp/disable' && request.method === 'POST') {
    const input = await readJson(request, 2048, 'totpDisableRequest');
    await throttleAuth(env, request, 'totp-disable', accountId, { ipLimit: 10, identityLimit: 5, windowMs: 60 * 60 * 1000 });
    const key = hashRecoveryCode(input.code) ? undefined : await readTotpKey(env);
    return json(await totpService.disable(env.DB, accountId, input, key), 200, {}, 'totpMutation');
  }

  if (path === '/api/account/password-salt' && request.method === 'GET') {
    return json(await accountService.readPasswordSalt(env.DB, accountId), 200, {}, 'passwordSalt');
  }

  if (path === '/api/account/password' && request.method === 'POST') {
    const input = await readJson(request, 4096, 'accountPasswordRequest');
    await throttleAuth(env, request, 'password-change', accountId, { ipLimit: 10, identityLimit: 5, windowMs: 60 * 60 * 1000 });
    const token = sessionTokenFromCookie(request);
    return json(await accountService.changePassword(env.DB, accountId, input, await hashSession(token)), 200, {}, 'accountPasswordMutation');
  }

  return null;
}
