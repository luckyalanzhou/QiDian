import { HttpError } from './validation.js';

export const PASSWORD_ITERATIONS = 600_000;
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_TTL = 3 * 24 * 60 * 60 * 1000;
export const SESSION_REFRESH_INTERVAL = 60 * 60 * 1000;
export const SESSION_COOKIE = 'qidian_session';
const DUMMY_PASSWORD_HASH = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
const encoder = new TextEncoder();

export function normalizeUsername(value) {
  if (typeof value !== 'string') throw new HttpError(400, '请输入账号');
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) throw new HttpError(400, '账号须为 3–32 位英文、数字或 . _ -，且以英文或数字开头');
  return username;
}
export function base64ToBytes(value, expectedBytes) {
  if (typeof value !== 'string' || value.length > 256 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new HttpError(400, '认证数据无效');
  let bytes;
  try { bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0)); } catch { throw new HttpError(400, '认证数据无效'); }
  if (expectedBytes && bytes.byteLength !== expectedBytes) throw new HttpError(400, '认证数据无效');
  return bytes;
}
export function bytesToBase64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
export function base64Url(bytes) { return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export async function randomBase64(size = 32) { const bytes = crypto.getRandomValues(new Uint8Array(size)); return bytesToBase64(bytes); }
export async function digestHex(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function hashSession(token) { return digestHex(token); }
export function sessionTokenFromCookie(request) {
  const value = request.headers.get('Cookie') || '';
  for (const item of value.split(';')) {
    const [name, ...rest] = item.trim().split('=');
    if (name === SESSION_COOKIE) return rest.join('=');
  }
  return '';
}
export function newSessionToken() { return base64Url(crypto.getRandomValues(new Uint8Array(32))); }
export function setSessionCookie(request, token, clear = false) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const value = clear ? `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secure}`
    : `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${Math.floor(SESSION_TTL / 1000)}; HttpOnly; SameSite=Strict${secure}`;
  return value;
}
export async function authorize(request, env, includeVault = false) {
  if (!env.DB) throw new HttpError(503, '尚未配置数据库');
  const token = sessionTokenFromCookie(request);
  if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) throw new HttpError(401, '请登录栖点账号');
  const columns = includeVault ? 'a.id, a.username, v.revision, v.data' : 'a.id, a.username';
  const vaultJoin = includeVault ? ' JOIN account_vaults v ON v.account_id = a.id' : '';
  const now = Date.now(), tokenHash = await hashSession(token);
  const row = await env.DB.prepare(`SELECT ${columns}, s.created AS session_created, s.expires AS session_expires FROM sessions s JOIN accounts a ON a.id = s.account_id${vaultJoin} WHERE s.token_hash = ? AND s.expires > ? AND s.created > ?`)
    .bind(tokenHash, now, now - SESSION_TTL).first();
  if (!row) throw new HttpError(401, '登录已过期，请重新登录');
  const sessionCreated = Number(row.session_created), sessionExpires = Number(row.session_expires);
  const refreshedExpiry = Math.min(sessionCreated + SESSION_TTL, now + SESSION_IDLE_TTL);
  if (sessionExpires < now + SESSION_IDLE_TTL - SESSION_REFRESH_INTERVAL && refreshedExpiry > sessionExpires) {
    await env.DB.prepare('UPDATE sessions SET expires = ? WHERE token_hash = ? AND expires = ?')
      .bind(refreshedExpiry, tokenHash, sessionExpires).run();
  }
  delete row.session_created;
  delete row.session_expires;
  return row;
}
export function checkOrigin(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  if (request.headers.get('Origin') !== new URL(request.url).origin) throw new HttpError(403, '禁止跨站写入');
}
export async function hashPasswordVerifier(verifierBase64) {
  const verifier = base64ToBytes(verifierBase64, 32);
  return bytesToBase64(await crypto.subtle.digest('SHA-256', verifier));
}
export function equalBase64ConstantTime(left, right) {
  const a = base64ToBytes(left, 32), b = base64ToBytes(right, 32);
  let difference = 0;
  for (let i = 0; i < 32; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
export function dummyPasswordHash() { return DUMMY_PASSWORD_HASH; }

export async function throttleAuth(env, request, action, identity, { ipLimit, identityLimit, windowMs }) {
  const now = Date.now(), windowStart = Math.floor(now / windowMs) * windowMs;
  const ip = request.headers.get('X-Client-IP') || 'unknown-client';
  const scopes = [
    { key: `${action}:ip:${await digestHex(ip)}`, limit: ipLimit },
    { key: `${action}:identity:${await digestHex(identity)}`, limit: identityLimit }
  ];
  const statements = [
    env.DB.prepare('DELETE FROM auth_throttles WHERE window_start < ?').bind(now - 24 * 60 * 60 * 1000),
    env.DB.prepare('DELETE FROM auth_challenges WHERE expires < ?').bind(now),
    env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now)
  ];
  for (const scope of scopes) statements.push(env.DB.prepare(`INSERT INTO auth_throttles(bucket_key, window_start, attempts) VALUES (?, ?, 1)
    ON CONFLICT(bucket_key) DO UPDATE SET attempts = attempts + 1`).bind(`${scope.key}:${windowStart}`, windowStart));
  await env.DB.batch(statements);
  const counts = await Promise.all(scopes.map(scope => env.DB.prepare('SELECT attempts FROM auth_throttles WHERE bucket_key = ?').bind(`${scope.key}:${windowStart}`).first()));
  if (counts.some((row, index) => (row?.attempts || 0) > scopes[index].limit)) throw new HttpError(429, '操作太频繁，请稍后再试');
}
