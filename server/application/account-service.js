import {
  PASSWORD_ITERATIONS, base64ToBytes, equalBase64ConstantTime, hashPasswordVerifier
} from '../auth.js';
import { HttpError } from '../validation.js';

/** Coordinates account use cases without depending on HTTP request objects. */
export function createAccountService(repository, { now = Date.now } = {}) {
  async function readProfile(db, accountId) {
    const profile = await repository.findAccountProfile(db, accountId);
    if (!profile) throw new HttpError(404, '账号资料不存在');
    return {
      id: profile.id,
      username: profile.username,
      created: profile.created,
      avatarMime: profile.avatar_mime || null
    };
  }

  async function readAvatar(db, accountId) {
    const profile = await repository.findAccountAvatar(db, accountId);
    if (!profile?.avatar || !profile.avatar_mime) throw new HttpError(404, '尚未设置头像');
    const bytes = profile.avatar instanceof ArrayBuffer ? new Uint8Array(profile.avatar)
      : Array.isArray(profile.avatar) ? Uint8Array.from(profile.avatar) : profile.avatar;
    return { bytes, mime: profile.avatar_mime };
  }

  async function saveAvatar(db, accountId, bytes, mime) {
    await repository.saveAccountAvatar(db, { accountId, bytes, mime, updated: now() });
    return { ok: true, mime };
  }

  async function clearAvatar(db, accountId) {
    await repository.clearAccountAvatar(db, accountId, now());
    return { ok: true };
  }

  async function readPasswordSalt(db, accountId) {
    const credential = await repository.findAccountPasswordSalt(db, accountId);
    if (!credential) throw new HttpError(404, '账号不存在');
    return { salt: credential.password_salt, iterations: PASSWORD_ITERATIONS };
  }

  async function changePassword(db, accountId, input, currentSessionHash) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, '密码数据无效');
    if (input.iterations !== PASSWORD_ITERATIONS) throw new HttpError(400, '密码派生参数无效，请刷新后重试');
    base64ToBytes(input.salt, 16);
    base64ToBytes(input.currentVerifier, 32);
    base64ToBytes(input.verifier, 32);

    const credential = await repository.findAccountPasswordHash(db, accountId);
    if (!credential || !equalBase64ConstantTime(credential.password_hash, await hashPasswordVerifier(input.currentVerifier))) {
      throw new HttpError(403, '当前密码不正确');
    }

    const result = await repository.updateAccountPassword(db, {
      accountId,
      expectedHash: credential.password_hash,
      salt: input.salt,
      hash: await hashPasswordVerifier(input.verifier),
      iterations: PASSWORD_ITERATIONS,
      currentSessionHash
    });
    if (result[0]?.meta?.changes !== 1) throw new HttpError(409, '账号凭据已更新，请重新登录后再试');
    return { ok: true, otherSessionsRevoked: true };
  }

  return { readProfile, readAvatar, saveAvatar, clearAvatar, readPasswordSalt, changePassword };
}
