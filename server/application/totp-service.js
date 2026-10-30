import { PASSWORD_ITERATIONS, base64ToBytes, equalBase64ConstantTime, hashPasswordVerifier } from '../auth.js';
import { decryptTotpSecret, encryptTotpSecret, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, createTotpUri, verifyTotpCode } from '../totp.js';
import { HttpError } from '../validation.js';

export function createTotpService(repository, accounts, {
  now = Date.now,
  createId = () => crypto.randomUUID()
} = {}) {
  function requireKey(key) {
    if (!key || Buffer.from(key).length !== 32) throw new HttpError(503, '两步验证密钥不可用；请联系设备管理员恢复账号');
    return key;
  }

  async function verifyCurrentPassword(db, accountId, verifier) {
    try { base64ToBytes(verifier, 32); }
    catch { throw new HttpError(400, '当前密码验证数据无效'); }
    const credential = await accounts.findAccountPasswordHash(db, accountId);
    if (!credential || !equalBase64ConstantTime(credential.password_hash, await hashPasswordVerifier(verifier))) {
      throw new HttpError(403, '当前密码不正确');
    }
  }

  async function beginEnrollment(db, accountId, { currentVerifier }, encryptionKey) {
    await verifyCurrentPassword(db, accountId, currentVerifier);
    const key = requireKey(encryptionKey);
    const profile = await accounts.findAccountProfile(db, accountId);
    if (!profile) throw new HttpError(404, '账号不存在');
    const secret = generateTotpSecret(), pendingId = createId(), encrypted = encryptTotpSecret(secret, key);
    const result = await repository.beginTotpEnrollment(db, {
      accountId, pendingId, encrypted, expires: now() + 10 * 60 * 1000
    });
    if (result.meta?.changes !== 1) throw new HttpError(409, '两步验证已启用；请先关闭后再重新绑定');
    return { pendingId, secret, uri: createTotpUri(secret, profile.username) };
  }

  async function confirmEnrollment(db, accountId, { pendingId, code }, encryptionKey) {
    if (typeof pendingId !== 'string' || pendingId.length > 128 || typeof code !== 'string' || code.length > 64) {
      throw new HttpError(400, '验证码数据无效');
    }
    const pending = await repository.findTotpState(db, accountId), current = now();
    if (!pending || Number(pending.enabled) === 1 || pending.pending_id !== pendingId || Number(pending.pending_expires) <= current) {
      throw new HttpError(409, '绑定步骤已过期，请重新开始');
    }
    let secret;
    try {
      secret = decryptTotpSecret({ iv: pending.pending_iv, ciphertext: pending.pending_ciphertext, tag: pending.pending_tag }, requireKey(encryptionKey));
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, '两步验证密钥不可用；请联系设备管理员恢复账号');
    }
    const counter = verifyTotpCode(secret, code, current, Number(pending.last_counter));
    if (counter === null) throw new HttpError(400, '验证码不正确，请检查设备时间后重试');
    const recoveryCodes = generateRecoveryCodes(10), recoveryCodeHashes = recoveryCodes.map(hashRecoveryCode);
    const activationId = pendingId, recoveryBatchId = createId();
    const enabled = await repository.enableTotp(db, {
      accountId, pendingId, counter, activationId, recoveryBatchId, recoveryCodeHashes, now: current
    });
    if (!enabled) throw new HttpError(409, '绑定步骤已失效，请重新开始');
    return { enabled: true, recoveryCodes };
  }

  async function disable(db, accountId, { currentVerifier, code }, encryptionKey) {
    await verifyCurrentPassword(db, accountId, currentVerifier);
    if (typeof code !== 'string' || code.length > 64) throw new HttpError(400, '验证码无效');
    const state = await repository.findTotpState(db, accountId);
    if (!state || Number(state.enabled) !== 1) throw new HttpError(409, '两步验证尚未启用');
    const recoveryHash = hashRecoveryCode(code);
    let result;
    if (recoveryHash) {
      result = await repository.disableTotpWithRecoveryCode(db, { accountId, codeHash: recoveryHash, now: now() });
    } else {
      let secret;
      try {
        secret = decryptTotpSecret({ iv: state.secret_iv, ciphertext: state.secret_ciphertext, tag: state.secret_tag }, requireKey(encryptionKey));
      } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(503, '两步验证密钥不可用；请联系设备管理员恢复账号');
      }
      const counter = verifyTotpCode(secret, code, now(), Number(state.last_counter));
      if (counter === null) throw new HttpError(403, '验证码不正确或已使用');
      result = await repository.disableTotpWithCounter(db, { accountId, counter });
    }
    const consumedStep = recoveryHash ? 1 : 0;
    if (result?.[consumedStep]?.meta?.changes !== 1) throw new HttpError(403, '验证码无效或已使用');
    return { ok: true, enabled: false };
  }

  return { beginEnrollment, confirmEnrollment, disable };
}
