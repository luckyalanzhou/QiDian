import { HttpError } from '../validation.js';

const RELEASES_URL = 'https://api.github.com/repos/luckyalanzhou/qidian/releases/latest';
const STABLE_VERSION = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RELEASE_VERSION = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function versionParts(value) {
  const match = STABLE_VERSION.exec(String(value || ''));
  if (!match) return null;
  return match.slice(1).map(BigInt);
}

function versionIsNewer(candidate, current) {
  const next = versionParts(candidate), installed = versionParts(current);
  if (!next || !installed) return false;
  // Bridge devices on the previous 0.1.x line to the reset release sequence.
  if (installed[0] === 0n && installed[1] === 1n && installed[2] >= 10n) return true;
  for (let index = 0; index < 3; index++) {
    if (next[index] !== installed[index]) return next[index] > installed[index];
  }
  return false;
}

/** Coordinates release checks and host update requests outside the HTTP layer. */
export function createSystemUpdateService(accountRepository) {
  async function requireSelfHosted(env) {
    if (env.SELF_HOSTED !== 'true') throw new HttpError(404, '此版本不提供设备更新');
  }

  async function canManageDevice(env, accountId) {
    const firstAccount = await accountRepository.findFirstAccount(env.DB);
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
    const installer = assets.find(asset => asset.name === `栖点-${version}.run` || asset.label === `栖点-${version}.run`);
    const checksum = assets.find(asset => asset.name === `栖点-${version}.run.sha256` || asset.label === `栖点-${version}.run.sha256`);
    return {
      version, releaseUrl,
      notes: typeof release.body === 'string' ? release.body.slice(0, 12000) : '',
      publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
      installerAvailable: !!installer && !!checksum
    };
  }

  async function version(env, accountId, { installedOnly = false } = {}) {
    await requireSelfHosted(env);
    const currentVersion = versionParts(env.QIDIAN_VERSION)?.join('.') || '0.0.0';
    if (installedOnly) return { currentVersion };
    const release = await latestRelease(env);
    return {
      currentVersion, latestVersion: release.version,
      updateAvailable: versionIsNewer(release.version, currentVersion),
      canUpdateDevice: await canManageDevice(env, accountId),
      installerAvailable: release.installerAvailable,
      updaterAvailable: typeof env.isQidianUpdaterReady === 'function' ? await env.isQidianUpdaterReady() : false,
      releaseUrl: release.releaseUrl, notes: release.notes, publishedAt: release.publishedAt
    };
  }

  async function assertUpdateAllowed(env, accountId) {
    await requireSelfHosted(env);
    if (!await canManageDevice(env, accountId)) throw new HttpError(403, '只有首个账号可以更新这台设备');
  }

  async function update(env, accountId) {
    await assertUpdateAllowed(env, accountId);
    const release = await latestRelease(env);
    const currentVersion = versionParts(env.QIDIAN_VERSION)?.join('.') || '0.0.0';
    if (!versionIsNewer(release.version, currentVersion)) throw new HttpError(409, '当前已经是最新版本');
    if (!release.installerAvailable) throw new HttpError(503, '最新版本暂未提供完整安装包');
    if (typeof env.requestQidianUpdate !== 'function') throw new HttpError(503, '设备更新服务尚未安装');
    if (typeof env.isQidianUpdaterReady !== 'function' || !await env.isQidianUpdaterReady()) throw new HttpError(503, '设备更新服务尚未安装');
    if (!await env.requestQidianUpdate()) throw new HttpError(409, '已有更新正在排队或执行');
    return { accepted: true, version: release.version };
  }

  async function status(env, accountId) {
    await requireSelfHosted(env);
    if (!await canManageDevice(env, accountId)) throw new HttpError(403, '只有首个账号可以读取设备更新状态');
    if (typeof env.readQidianUpdateStatus !== 'function') throw new HttpError(503, '设备更新服务尚未安装');
    return env.readQidianUpdateStatus();
  }

  return { version, assertUpdateAllowed, update, status };
}
