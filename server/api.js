import {
  authorize, checkOrigin, PASSWORD_ITERATIONS, SESSION_IDLE_TTL, base64ToBytes,
  randomBase64, newSessionToken, hashSession, setSessionCookie, sessionTokenFromCookie,
  hashPasswordVerifier, equalBase64ConstantTime, dummyPasswordHash, normalizeUsername,
  throttleAuth
} from './auth.js';
import { HttpError, validateVault, MAX_VAULT_BYTES, MAX_FILE_BYTES } from './validation.js';

const CHUNK = 256 * 1024;
const MAX_AVATAR_BYTES = 512 * 1024;
const RELEASES_URL = 'https://api.github.com/repos/luckyalanzhou/qidian/releases/latest';
const STABLE_VERSION = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RELEASE_VERSION = /^v[0-9]\.[0-9]\.(0|[1-9]\d?)$/;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const json = (data, status = 200, extra = {}) => Response.json(data, { status, headers: { ...headers, ...extra } });

function versionParts(value) {
  const match = STABLE_VERSION.exec(String(value || ''));
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

function versionIsNewer(candidate, current) {
  const next = versionParts(candidate), installed = versionParts(current);
  if (!next || !installed) return false;
  // Bridge devices on the previous 0.1.x line to the reset release sequence.
  if (/^v?[0-9]\.[0-9]\.(0|[1-9]\d?)$/.test(String(candidate)) && installed[0] === 0 && installed[1] === 1 && installed[2] >= 10) return true;
  for (let index = 0; index < 3; index++) {
    if (next[index] !== installed[index]) return next[index] > installed[index];
  }
  return false;
}

async function canManageDevice(env, accountId) {
  const firstAccount = await env.DB.prepare('SELECT id FROM accounts ORDER BY rowid LIMIT 1').first();
  return firstAccount?.id === accountId;
}

async function latestRelease(env) {
  const fetchRelease = env.fetchRelease || globalThis.fetch;
  const response = await fetchRelease(RELEASES_URL, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'qidian-version-check', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new HttpError(response.status === 404 ? 404 : 503, response.status === 404 ? '尚无可用的公开版本' : '暂时无法检查新版本，请稍后重试');
  const release = await response.json();
  const parts = versionParts(release.tag_name);
  let releaseUrl;
  try {
    const url = new URL(release.html_url);
    if (url.origin !== 'https://github.com' || !url.pathname.startsWith('/luckyalanzhou/qidian/releases/tag/')) throw new Error('invalid release URL');
    releaseUrl = url.href;
  } catch { throw new HttpError(503, '最新版本信息格式无效'); }
  if (!parts || !RELEASE_VERSION.test(release.tag_name) || release.draft || release.prerelease) throw new HttpError(503, '最新版本信息格式无效');
  const version = parts.join('.');
  const assets = Array.isArray(release.assets) ? release.assets : [];
  const installer = assets.find(asset => asset.name === `栖点-${version}.run`);
  const checksum = assets.find(asset => asset.name === `栖点-${version}.run.sha256`);
  return {
    version, releaseUrl,
    notes: typeof release.body === 'string' ? release.body.slice(0, 12000) : '',
    publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
    installerAvailable: !!installer && !!checksum
  };
}

async function readJson(request, maxBytes = MAX_VAULT_BYTES + 10000) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new HttpError(415, '需要 JSON 请求');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '请求为空');
  const parts = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, '请求过大'); } parts.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HttpError(400, 'JSON 无效'); }
}

async function readLimitedBytes(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '图片为空');
  const parts = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new HttpError(413, '头像图片不能超过 512 KB'); }
    parts.push(value);
  }
  if (!size) throw new HttpError(400, '图片为空');
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

function sniffAvatarMime(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  throw new HttpError(415, '头像只支持 PNG、JPEG 或 WebP 图片');
}

function registerStatements(env, { accountId, username, salt, passwordHash, token, now }) {
  return [
    env.DB.prepare('INSERT INTO accounts(id, username, username_normalized, password_salt, password_hash, password_iterations, created) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(accountId, username, username, salt, passwordHash, PASSWORD_ITERATIONS, now),
    env.DB.prepare('UPDATE legacy_claim SET claimed_by = ? WHERE id = 1 AND claimed_by IS NULL AND EXISTS (SELECT 1 FROM accounts WHERE id = ?)').bind(accountId, accountId),
    env.DB.prepare(`INSERT INTO account_vaults(account_id, revision, data, updated)
      SELECT ?, revision, data, updated FROM vault WHERE id = 1 AND (SELECT claimed_by FROM legacy_claim WHERE id = 1) = ?`).bind(accountId, accountId),
    env.DB.prepare(`INSERT INTO account_snapshots(account_id, revision, data, created)
      SELECT ?, revision, data, created FROM snapshots WHERE (SELECT claimed_by FROM legacy_claim WHERE id = 1) = ?`).bind(accountId, accountId),
    env.DB.prepare(`INSERT INTO account_assets(account_id, id, name, mime, size, created)
      SELECT ?, id, name, mime, size, created FROM assets WHERE (SELECT claimed_by FROM legacy_claim WHERE id = 1) = ?`).bind(accountId, accountId),
    env.DB.prepare(`INSERT INTO account_asset_chunks(account_id, asset_id, ordinal, data)
      SELECT ?, asset_id, ordinal, data FROM asset_chunks WHERE (SELECT claimed_by FROM legacy_claim WHERE id = 1) = ?`).bind(accountId, accountId),
    env.DB.prepare(`INSERT INTO account_vaults(account_id, revision, data, updated)
      SELECT ?, 0, '{"categories":[],"notes":[],"theme":"light","pasteMode":"rich"}', ? WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ?) ON CONFLICT(account_id) DO NOTHING`).bind(accountId, now, accountId),
    env.DB.prepare(`INSERT INTO sessions(token_hash, account_id, created, expires)
      SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ?)`).bind(token.hash, accountId, now, now + SESSION_IDLE_TTL, accountId)
  ];
}

async function isEmptyLegacyVault(env) {
  const [vault, snapshots, assets] = await Promise.all([
    env.DB.prepare('SELECT revision, data FROM vault WHERE id = 1').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM snapshots').first(),
    env.DB.prepare('SELECT COUNT(*) AS count FROM assets').first()
  ]);
  if (!vault || vault.revision !== 0 || snapshots?.count || assets?.count) return false;
  try {
    const data = JSON.parse(vault.data);
    return Array.isArray(data.notes) && data.notes.length === 0
      && Array.isArray(data.categories) && data.categories.length === 0
      && data.theme === 'light' && data.pasteMode === 'rich';
  } catch { return false; }
}

async function registrationState(env) {
  const ownerExists = !!(await env.DB.prepare('SELECT id FROM accounts ORDER BY rowid LIMIT 1').first());
  const setupRequired = env.SELF_HOSTED === 'true' && !ownerExists;
  // A fresh private self-hosted install always permits exactly the first owner.
  // Further signups require the deployment administrator to opt in.
  return { registrationEnabled: env.REGISTRATION_ENABLED === 'true' || setupRequired, setupRequired };
}

async function handleAuth(request, env, path) {
  if (!env.DB) throw new HttpError(503, '尚未配置数据库');
  if (path === '/api/auth/config' && request.method === 'GET') {
    return json(await registrationState(env));
  }
  if (path === '/api/auth/session' && request.method === 'GET') {
    try {
      const session = await authorize(request, env, true);
      return json({ id: session.id, username: session.username, revision: session.revision, data: JSON.parse(session.data) });
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        return json({ error: error.message, ...await registrationState(env) }, 401);
      }
      throw error;
    }
  }
  if (path === '/api/auth/register' && request.method === 'POST') {
    if (!(await registrationState(env)).registrationEnabled) throw new HttpError(403, '当前未开放注册');
    const input = await readJson(request, 4096), username = normalizeUsername(input.username);
    if (input.iterations !== PASSWORD_ITERATIONS) throw new HttpError(400, '密码派生参数无效，请刷新后重试');
    base64ToBytes(input.salt, 16); base64ToBytes(input.verifier, 32);
    await throttleAuth(env, request, 'register', username, { ipLimit: 12, identityLimit: 6, windowMs: 60 * 60 * 1000 });
    const existing = await env.DB.prepare('SELECT username_normalized FROM accounts WHERE username_normalized = ?').bind(username).all();
    if (existing.results.some(row => row.username_normalized === username)) throw new HttpError(409, '账号名称已被使用');
    const claim = await env.DB.prepare('SELECT claimed_by FROM legacy_claim WHERE id = 1').first();
    if (claim && !claim.claimed_by && env.LOCAL_DEV !== 'true') {
      const selfHostFreshInstall = env.SELF_HOSTED === 'true' && await isEmptyLegacyVault(env);
      if (!selfHostFreshInstall) throw new HttpError(409, '旧笔记库尚未完成首次认领，请联系管理员后再开放注册');
    }
    const passwordHash = await hashPasswordVerifier(input.verifier);
    const now = Date.now(), accountId = crypto.randomUUID(), rawToken = newSessionToken();
    const token = { value: rawToken, hash: await hashSession(rawToken) };
    try {
      const result = await env.DB.batch(registerStatements(env, { accountId, username, salt: input.salt, passwordHash, token, now }));
      if (result[0]?.meta?.changes !== 1) throw new HttpError(409, '账号创建失败，请更换账号或稍后再试');
      return json({ id: accountId, username, legacyClaimed: result[1]?.meta?.changes === 1 }, 201, { 'Set-Cookie': setSessionCookie(request, rawToken) });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (/UNIQUE|constraint failed/i.test(String(error))) throw new HttpError(409, '注册未完成，请更换账号或稍后再试');
      throw error;
    }
  }
  if (path === '/api/auth/challenge' && request.method === 'POST') {
    const input = await readJson(request, 2048), username = normalizeUsername(input.username);
    await throttleAuth(env, request, 'challenge', username, { ipLimit: 30, identityLimit: 10, windowMs: 10 * 60 * 1000 });
    const account = await env.DB.prepare('SELECT id, username_normalized, password_salt FROM accounts WHERE username_normalized = ?').bind(username).first();
    const normalizedUsername = account?.username_normalized || username;
    const id = crypto.randomUUID(), salt = account?.password_salt || await randomBase64(16), now = Date.now();
    await env.DB.prepare('INSERT INTO auth_challenges(id, account_id, username_normalized, salt, created, expires) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, account?.id || null, normalizedUsername, salt, now, now + 5 * 60 * 1000).run();
    return json({ id, salt, iterations: PASSWORD_ITERATIONS });
  }
  if (path === '/api/auth/verify' && request.method === 'POST') {
    const input = await readJson(request, 2048);
    await throttleAuth(env, request, 'verify', String(input.id || '').slice(0, 80), { ipLimit: 30, identityLimit: 30, windowMs: 10 * 60 * 1000 });
    const challenge = await env.DB.prepare('SELECT * FROM auth_challenges WHERE id = ? AND expires > ?').bind(input.id, Date.now()).first();
    if (!challenge) throw new HttpError(401, '账号或密码不正确，请重试');
    const consumed = await env.DB.prepare('DELETE FROM auth_challenges WHERE id = ? AND expires > ?').bind(input.id, Date.now()).run();
    if (consumed.meta.changes !== 1) throw new HttpError(401, '账号或密码不正确，请重试');
    let account = null, passwordHash = dummyPasswordHash(), validPassword = false;
    if (challenge.account_id) {
      account = await env.DB.prepare('SELECT id, username, password_hash FROM accounts WHERE id = ?').bind(challenge.account_id).first();
      if (account) passwordHash = account.password_hash;
    }
    try { validPassword = equalBase64ConstantTime(passwordHash, await hashPasswordVerifier(input.verifier)); } catch { validPassword = false; }
    if (!challenge.account_id || !account || !validPassword) throw new HttpError(401, '账号或密码不正确，请重试');
    const vault = await env.DB.prepare('SELECT account_id FROM account_vaults WHERE account_id = ?').bind(challenge.account_id).first();
    if (!vault) throw new HttpError(404, '账号知识库不存在');
    const rawToken = newSessionToken(), now = Date.now();
    await env.DB.prepare('INSERT INTO sessions(token_hash, account_id, created, expires) VALUES (?, ?, ?, ?)')
      .bind(await hashSession(rawToken), challenge.account_id, now, now + SESSION_IDLE_TTL).run();
    return json({ id: account.id }, 200, { 'Set-Cookie': setSessionCookie(request, rawToken) });
  }
  if (path === '/api/auth/logout' && request.method === 'POST') {
    const token = sessionTokenFromCookie(request);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashSession(token)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': setSessionCookie(request, '', true) });
  }
  return null;
}

export async function handle(request, env) {
  try {
    checkOrigin(request);
    const url = new URL(request.url), path = url.pathname.replace(/\/$/, '');
    if (path.startsWith('/api/auth/')) {
      const response = await handleAuth(request, env, path);
      if (response) return response;
    }
    const account = await authorize(request, env);
    const accountId = account.id;
    if (path === '/api/session' && request.method === 'GET') return json({ owner: accountId, username: account.username, local: false });
    if (!env.DB) throw new HttpError(503, '尚未配置数据库');
    if (path === '/api/system/version' && request.method === 'GET') {
      if (env.SELF_HOSTED !== 'true') throw new HttpError(404, '此版本不提供设备更新');
      const currentVersion = versionParts(env.QIDIAN_VERSION)?.join('.') || '0.0.0';
      if (new URL(request.url).searchParams.get('installed') === '1') return json({ currentVersion });
      const release = await latestRelease(env);
      return json({
        currentVersion, latestVersion: release.version,
        updateAvailable: versionIsNewer(release.version, currentVersion),
        canUpdateDevice: await canManageDevice(env, accountId),
        installerAvailable: release.installerAvailable,
        updaterAvailable: typeof env.isQidianUpdaterReady === 'function' ? await env.isQidianUpdaterReady() : false,
        releaseUrl: release.releaseUrl, notes: release.notes, publishedAt: release.publishedAt
      });
    }
    if (path === '/api/system/update' && request.method === 'POST') {
      if (env.SELF_HOSTED !== 'true') throw new HttpError(404, '此版本不提供设备更新');
      if (!await canManageDevice(env, accountId)) throw new HttpError(403, '只有首个账号可以更新这台设备');
      await readJson(request, 1024);
      const release = await latestRelease(env);
      const currentVersion = versionParts(env.QIDIAN_VERSION)?.join('.') || '0.0.0';
      if (!versionIsNewer(release.version, currentVersion)) throw new HttpError(409, '当前已经是最新版本');
      if (!release.installerAvailable) throw new HttpError(503, '最新版本暂未提供完整安装包');
      if (typeof env.requestQidianUpdate !== 'function') throw new HttpError(503, '设备更新服务尚未安装');
      if (typeof env.isQidianUpdaterReady !== 'function' || !await env.isQidianUpdaterReady()) throw new HttpError(503, '设备更新服务尚未安装');
      const queued = await env.requestQidianUpdate();
      if (!queued) throw new HttpError(409, '已有更新正在排队或执行');
      return json({ accepted: true, version: release.version }, 202);
    }
    if (path === '/api/system/update-status' && request.method === 'GET') {
      if (env.SELF_HOSTED !== 'true') throw new HttpError(404, '此版本不提供设备更新');
      if (typeof env.readQidianUpdateStatus !== 'function') throw new HttpError(503, '设备更新服务尚未安装');
      return json(await env.readQidianUpdateStatus());
    }
    if (path === '/api/vault' && request.method === 'GET') {
      const row = await env.DB.prepare('SELECT * FROM account_vaults WHERE account_id = ?').bind(accountId).first();
      if (!row) throw new HttpError(404, '知识库不存在');
      return json({ revision: row.revision, data: JSON.parse(row.data) });
    }
    if (path === '/api/vault/revision' && request.method === 'GET') {
      const row = await env.DB.prepare('SELECT revision FROM account_vaults WHERE account_id = ?').bind(accountId).first();
      if (!row) throw new HttpError(404, '知识库不存在');
      return json({ revision: row.revision });
    }
    if (path === '/api/account/profile' && request.method === 'GET') {
      const profile = await env.DB.prepare(`SELECT a.id, a.username, a.created, p.avatar_mime
        FROM accounts a LEFT JOIN account_profiles p ON p.account_id = a.id WHERE a.id = ?`).bind(accountId).first();
      if (!profile) throw new HttpError(404, '账号资料不存在');
      return json({ id: profile.id, username: profile.username, created: profile.created, avatarMime: profile.avatar_mime || null });
    }
    if (path === '/api/account/avatar' && request.method === 'GET') {
      const profile = await env.DB.prepare('SELECT avatar, avatar_mime FROM account_profiles WHERE account_id = ?').bind(accountId).first();
      if (!profile?.avatar || !profile.avatar_mime) throw new HttpError(404, '尚未设置头像');
      const avatar = profile.avatar instanceof ArrayBuffer ? new Uint8Array(profile.avatar)
        : Array.isArray(profile.avatar) ? Uint8Array.from(profile.avatar) : profile.avatar;
      return new Response(avatar, { headers: { ...headers, 'Cache-Control': 'private, no-store', 'Content-Type': profile.avatar_mime,
        'Content-Security-Policy': "default-src 'none'; sandbox" } });
    }
    if (path === '/api/account/avatar' && request.method === 'PUT') {
      const bytes = await readLimitedBytes(request, MAX_AVATAR_BYTES), mime = sniffAvatarMime(bytes);
      await env.DB.prepare(`INSERT INTO account_profiles(account_id, avatar, avatar_mime, updated) VALUES (?, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET avatar = excluded.avatar, avatar_mime = excluded.avatar_mime, updated = excluded.updated`)
        .bind(accountId, bytes.buffer, mime, Date.now()).run();
      return json({ ok: true, mime });
    }
    if (path === '/api/account/avatar' && request.method === 'DELETE') {
      await env.DB.prepare('UPDATE account_profiles SET avatar = NULL, avatar_mime = NULL, updated = ? WHERE account_id = ?').bind(Date.now(), accountId).run();
      return json({ ok: true });
    }
    if (path === '/api/account/password-salt' && request.method === 'GET') {
      const credential = await env.DB.prepare('SELECT password_salt FROM accounts WHERE id = ?').bind(accountId).first();
      if (!credential) throw new HttpError(404, '账号不存在');
      return json({ salt: credential.password_salt, iterations: PASSWORD_ITERATIONS });
    }
    if (path === '/api/account/password' && request.method === 'POST') {
      const input = await readJson(request, 4096);
      if (input.iterations !== PASSWORD_ITERATIONS) throw new HttpError(400, '密码派生参数无效，请刷新后重试');
      base64ToBytes(input.salt, 16); base64ToBytes(input.currentVerifier, 32); base64ToBytes(input.verifier, 32);
      await throttleAuth(env, request, 'password-change', accountId, { ipLimit: 10, identityLimit: 5, windowMs: 60 * 60 * 1000 });
      const credential = await env.DB.prepare('SELECT password_hash FROM accounts WHERE id = ?').bind(accountId).first();
      if (!credential || !equalBase64ConstantTime(credential.password_hash, await hashPasswordVerifier(input.currentVerifier))) throw new HttpError(403, '当前密码不正确');
      const passwordHash = await hashPasswordVerifier(input.verifier), token = sessionTokenFromCookie(request);
      const result = await env.DB.batch([
        env.DB.prepare('UPDATE accounts SET password_salt = ?, password_hash = ?, password_iterations = ? WHERE id = ? AND password_hash = ?')
          .bind(input.salt, passwordHash, PASSWORD_ITERATIONS, accountId, credential.password_hash),
        env.DB.prepare(`DELETE FROM sessions WHERE account_id = ? AND token_hash <> ?
          AND EXISTS (SELECT 1 FROM accounts WHERE id = ? AND password_hash = ?)`)
          .bind(accountId, await hashSession(token), accountId, passwordHash)
      ]);
      if (result[0]?.meta?.changes !== 1) throw new HttpError(409, '账号凭据已更新，请重新登录后再试');
      return json({ ok: true, otherSessionsRevoked: true });
    }
    if (path === '/api/vault' && request.method === 'PUT') {
      const input = await readJson(request);
      if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new HttpError(400, '版本无效');
      const data = validateVault(input.data);
      const result = await env.DB.prepare('UPDATE account_vaults SET data = ?, revision = revision + 1, updated = ? WHERE account_id = ? AND revision = ?')
        .bind(JSON.stringify(data), Date.now(), accountId, input.revision).run();
      if (result.meta.changes !== 1) throw new HttpError(409, '知识库版本已更新，需要重新同步');
      return json({ revision: input.revision + 1 });
    }
    if (path === '/api/backups' && request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT revision, created FROM account_snapshots WHERE account_id = ? ORDER BY revision DESC').bind(accountId).all();
      return json(results);
    }
    const backup = path.match(/^\/api\/backups\/(\d+)$/);
    if (backup && request.method === 'GET') {
      const row = await env.DB.prepare('SELECT * FROM account_snapshots WHERE account_id = ? AND revision = ?').bind(accountId, Number(backup[1])).first();
      if (!row) throw new HttpError(404, '备份不存在');
      return json({ revision: row.revision, data: JSON.parse(row.data) });
    }
    if (path === '/api/assets' && request.method === 'GET') {
      return json((await env.DB.prepare('SELECT id, name, mime, size, created FROM account_assets WHERE account_id = ? ORDER BY created DESC').bind(accountId).all()).results);
    }
    if (path === '/api/assets' && request.method === 'POST') {
      let name; try { name = decodeURIComponent(request.headers.get('X-File-Name') || '附件'); } catch { throw new HttpError(400, '文件名无效'); }
      if (!name || name.length > 200) throw new HttpError(400, '文件名太长');
      const reader = request.body?.getReader(); if (!reader) throw new HttpError(400, '文件为空');
      const parts = []; let size = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break; size += value.byteLength;
        if (size > MAX_FILE_BYTES) { await reader.cancel(); throw new HttpError(413, '单个文件上限为 8 MB'); } parts.push(value);
      }
      if (!size) throw new HttpError(400, '文件为空');
      const bytes = new Uint8Array(size); let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.length; }
      let mime = 'application/octet-stream';
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) mime = 'image/png';
      else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mime = 'image/jpeg';
      else if (/^GIF8[79]a$/.test(new TextDecoder().decode(bytes.slice(0, 6)))) mime = 'image/gif';
      else if (new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') mime = 'image/webp';
      const id = crypto.randomUUID(), created = Date.now();
      const statements = [env.DB.prepare('INSERT INTO account_assets(account_id, id, name, mime, size, created) VALUES (?, ?, ?, ?, ?, ?)').bind(accountId, id, name, mime, size, created)];
      for (let i = 0; i < size; i += CHUNK) statements.push(env.DB.prepare('INSERT INTO account_asset_chunks(account_id, asset_id, ordinal, data) VALUES (?, ?, ?, ?)').bind(accountId, id, i / CHUNK, bytes.slice(i, i + CHUNK).buffer));
      try { await env.DB.batch(statements); } catch (error) { if (String(error).includes('ASSET_QUOTA')) throw new HttpError(413, '此账号附件总容量已达 100 MB，请先导出整理'); throw error; }
      return json({ id, name, mime, size, created, url: `/api/assets/${id}` }, 201);
    }
    const asset = path.match(/^\/api\/assets\/([a-f0-9-]{36})$/);
    if (asset && request.method === 'GET') {
      const row = await env.DB.prepare('SELECT * FROM account_assets WHERE account_id = ? AND id = ?').bind(accountId, asset[1]).first();
      if (!row) throw new HttpError(404, '附件不存在');
      const { results } = await env.DB.prepare('SELECT data FROM account_asset_chunks WHERE account_id = ? AND asset_id = ? ORDER BY ordinal').bind(accountId, asset[1]).all();
      const bytes = new Uint8Array(row.size); let offset = 0;
      for (const part of results) { const chunk = new Uint8Array(part.data); bytes.set(chunk, offset); offset += chunk.length; }
      if (offset !== row.size) throw new HttpError(500, '附件数据不完整');
      return new Response(bytes, { headers: { ...headers, 'Content-Type': row.mime,
        'Content-Disposition': `${row.mime.startsWith('image/') && !url.searchParams.has('download') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
        'Content-Security-Policy': "default-src 'none'; sandbox" } });
    }
    throw new HttpError(404, '接口不存在');
  } catch (error) {
    return json({ error: error instanceof HttpError ? error.message : '服务器暂时无法完成操作' }, error instanceof HttpError ? error.status : 500);
  }
}
