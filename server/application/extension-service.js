import { HttpError, validateVault } from '../validation.js';
import { bookmarkURL } from '../../shared/bookmarks.js';
import { digestHex, newSessionToken } from '../auth.js';

const PAIRING_TTL = 5 * 60 * 1000;
const TOKEN_TTL = 365 * 24 * 60 * 60 * 1000;
const TOKEN_PREFIX = 'qidian_ext_';
const PAIRING_PREFIX = 'qidian_pair_';

function loopbackHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1') return true;
  const octets = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  return !!octets && octets.slice(1).every(value => Number(value) <= 255);
}

export function assertSecureExtensionInstance(request) {
  const url = new URL(request.url);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopbackHost(url.hostname))) {
    throw new HttpError(400, '浏览器扩展只支持 HTTPS 实例；HTTP 仅允许本机回环地址');
  }
}

function tokenDigest(token) {
  return digestHex(token);
}

function validUrl(value) {
  try { return bookmarkURL(value); }
  catch (error) { throw new HttpError(400, error?.message || '书签网址无效'); }
}

function findDuplicate(items, url) {
  for (const item of items) {
    if (item.kind === 'link' && item.url === url) return item;
    if (item.kind === 'folder') {
      const nested = findDuplicate(item.children, url);
      if (nested) return nested;
    }
  }
  return null;
}

export function createExtensionService(repository, vaultRepository, { now = Date.now, randomToken = newSessionToken } = {}) {
  async function issuePairing(db, accountId, label) {
    const name = typeof label === 'string' ? label.trim().slice(0, 80) : '';
    if (!name) throw new HttpError(400, '请输入扩展名称');
    const created = now(), code = `${PAIRING_PREFIX}${randomToken()}`;
    await repository.removeExpiredExtensionCredentials(db, created);
    await repository.createPairingCode(db, {
      accountId, codeHash: await tokenDigest(code), name, created, expires: created + PAIRING_TTL
    });
    return { code, name, expires: created + PAIRING_TTL };
  }

  async function pair(db, code) {
    if (typeof code !== 'string' || !new RegExp(`^${PAIRING_PREFIX}[A-Za-z0-9_-]{40,50}$`).test(code)) {
      throw new HttpError(401, '配对码无效或已过期，请重新生成');
    }
    const created = now();
    const token = `${TOKEN_PREFIX}${randomToken()}`, expires = created + TOKEN_TTL;
    const pairing = await repository.consumePairingCodeAndCreateToken(db, {
      codeHash: await tokenDigest(code), now: created,
      token: { id: crypto.randomUUID(), tokenHash: await tokenDigest(token), created, expires }
    });
    if (!pairing) throw new HttpError(401, '配对码无效或已过期，请重新生成');
    return { token, name: pairing.name, expires };
  }

  async function authorizeToken(db, authorization) {
    const match = typeof authorization === 'string' && /^Bearer (qidian_ext_[A-Za-z0-9_-]{40,50})$/.exec(authorization);
    if (!match) throw new HttpError(401, '扩展凭据无效或已撤销');
    const row = await repository.findAndTouchExtensionToken(db, { tokenHash: await tokenDigest(match[1]), now: now() });
    if (!row) throw new HttpError(401, '扩展凭据无效或已撤销');
    return row.account_id;
  }

  async function createBookmark(db, accountId, input) {
    const url = validUrl(input.url);
    const title = typeof input.title === 'string' ? input.title.trim().slice(0, 500) : '';
    const safeTitle = title || new URL(url).hostname;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await vaultRepository.findVault(db, accountId);
      if (!current) throw new HttpError(404, '知识库不存在');
      const data = validateVault(JSON.parse(current.data));
      const duplicate = findDuplicate(data.bookmarks, url);
      if (duplicate) return { status: 'duplicate', id: duplicate.id, revision: current.revision };
      const bookmark = { id: crypto.randomUUID(), kind: 'link', title: safeTitle, url };
      const nextData = validateVault({ ...data, bookmarks: [...data.bookmarks, bookmark] });
      const result = await vaultRepository.saveVaultAtRevision(db, {
        accountId, revision: current.revision, data: JSON.stringify(nextData), updated: now()
      });
      if (result?.meta?.changes === 1) return { status: 'created', id: bookmark.id, revision: current.revision + 1 };
    }
    throw new HttpError(409, '知识库正在更新，请重试保存');
  }

  return {
    issuePairing,
    pair,
    authorizeToken,
    createBookmark,
    listTokens: (db, accountId) => repository.listExtensionTokens(db, accountId, now()),
    async revokeToken(db, accountId, id) {
      if (!/^[a-f0-9-]{36}$/i.test(id || '')) throw new HttpError(404, '扩展凭据不存在');
      const revoked = await repository.revokeExtensionToken(db, { accountId, id, now: now() });
      if (!revoked) throw new HttpError(404, '扩展凭据不存在');
      return { ok: true };
    }
  };
}
