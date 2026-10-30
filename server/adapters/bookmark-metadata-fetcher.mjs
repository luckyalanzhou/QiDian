import { lookup as dnsLookup, resolve6 as dnsResolve6 } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const MAX_PAGE_BYTES = 512 * 1024;
const MAX_ICON_BYTES = 256 * 1024;
const TOTAL_TIMEOUT_MS = 8_000;
const PREF64_TIMEOUT_MS = 1_000;
const MAX_REDIRECTS = 4;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

const blockedIPv4 = new BlockList();
for (const [subnet, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
]) blockedIPv4.addSubnet(subnet, prefix, 'ipv4');

const globalIPv6 = new BlockList();
globalIPv6.addSubnet('2000::', 3, 'ipv6');
const blockedIPv6 = new BlockList();
for (const [subnet, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20], ['::ffff:0:0', 96]
]) blockedIPv6.addSubnet(subnet, prefix, 'ipv6');

function normalizedHostname(url) {
  return url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

function validateURL(value, previous) {
  let url;
  try { url = new URL(value); } catch { throw Error('网址无效'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw Error('仅支持不含登录凭据的 HTTP / HTTPS 网址');
  if (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80')) throw Error('自动获取信息仅支持标准 HTTP / HTTPS 端口');
  if (previous?.protocol === 'https:' && url.protocol !== 'https:') throw Error('不允许 HTTPS 降级跳转');
  const host = normalizedHostname(url);
  if (!host || ['localhost', 'invalid', 'test', 'example'].some(suffix => host === suffix || host.endsWith(`.${suffix}`))
    || ['local', 'internal', 'lan', 'home.arpa', 'onion'].some(suffix => host === suffix || host.endsWith(`.${suffix}`))) {
    throw Error('不允许访问本机或特殊用途域名');
  }
  return url;
}

function isPublicAddress(address, family) {
  const detected = isIP(address);
  if (!detected || detected !== family) return false;
  if (family === 4) return !blockedIPv4.check(address, 'ipv4');
  return globalIPv6.check(address, 'ipv6') && !blockedIPv6.check(address, 'ipv6');
}

const rfc6052PrefixLengths = [32, 40, 48, 56, 64, 96];
const rfc7050Addresses = ['192.0.0.170', '192.0.0.171'];

function ipv6Bytes(address) {
  if (isIP(address) !== 6 || address.includes('%')) return null;
  let value = address.toLowerCase();
  if (value.includes('.')) {
    const separator = value.lastIndexOf(':');
    const ipv4 = value.slice(separator + 1);
    if (isIP(ipv4) !== 4) return null;
    const [a, b, c, d] = ipv4.split('.').map(Number);
    value = `${value.slice(0, separator)}:${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const sections = value.split('::');
  if (sections.length > 2) return null;
  const left = sections[0] ? sections[0].split(':') : [];
  const right = sections.length === 2 && sections[1] ? sections[1].split(':') : [];
  const zeroCount = 8 - left.length - right.length;
  if ((sections.length === 1 && zeroCount !== 0) || (sections.length === 2 && zeroCount < 1)) return null;
  const words = [...left, ...Array(zeroCount).fill('0'), ...right];
  if (words.length !== 8 || words.some(word => !/^[0-9a-f]{1,4}$/.test(word))) return null;
  const bytes = Buffer.alloc(16);
  words.forEach((word, index) => bytes.writeUInt16BE(Number.parseInt(word, 16), index * 2));
  return bytes;
}

function prefixedBy(addressBytes, prefix) {
  return !!addressBytes && prefix.bytes.every((byte, index) => addressBytes[index] === byte);
}

function decodePref64Address(address, prefix) {
  const bytes = ipv6Bytes(address);
  if (!bytes || !prefixedBy(bytes, prefix)) return null;
  let ipv4;
  if (prefix.length === 96) ipv4 = bytes.subarray(12, 16);
  else {
    if (bytes[8] !== 0) return null;
    const prefixBytes = prefix.length / 8;
    const beforeU = 8 - prefixBytes;
    const afterU = 4 - beforeU;
    if (bytes.subarray(9 + afterU).some(Boolean)) return null;
    ipv4 = Buffer.concat([bytes.subarray(prefixBytes, 8), bytes.subarray(9, 9 + afterU)]);
  }
  return ipv4.length === 4 ? [...ipv4].join('.') : null;
}

function discoverPref64(addresses) {
  if (!Array.isArray(addresses)) throw Error('DNS64 前缀响应无效');
  if (addresses.length === 0) return [];
  const matches = new Map(rfc7050Addresses.map(address => [address, new Map()]));
  for (const address of addresses) {
    const bytes = ipv6Bytes(address);
    if (!bytes) throw Error('DNS64 前缀响应无效');
    for (const expected of rfc7050Addresses) {
      for (const length of rfc6052PrefixLengths) {
        const prefix = { length, bytes: Buffer.from(bytes.subarray(0, length / 8)) };
        if (decodePref64Address(address, prefix) === expected) {
          matches.get(expected).set(`${length}:${prefix.bytes.toString('hex')}`, prefix);
        }
      }
    }
  }
  const second = matches.get(rfc7050Addresses[1]);
  const prefixes = [...matches.get(rfc7050Addresses[0])]
    .filter(([key]) => second.has(key))
    .map(([, prefix]) => prefix);
  if (prefixes.length === 0) throw Error('DNS64 前缀无法可靠识别');
  return prefixes;
}

async function resolvePref64(lookupIPv6, timeoutMs) {
  try {
    return { available: true, prefixes: discoverPref64(await withTimeout(lookupIPv6('ipv4only.arpa'), timeoutMs)) };
  } catch (error) {
    if (error?.code === 'ENODATA') return { available: true, prefixes: [] };
    return { available: false, prefixes: [] };
  }
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('远程请求超时')), timeoutMs);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
}

async function resolvePublicAddress(hostname, lookup, timeoutMs, getPref64) {
  const family = isIP(hostname);
  const answers = family
    ? [{ address: hostname, family }]
    : await withTimeout(lookup(hostname), timeoutMs);
  if (!Array.isArray(answers) || answers.length === 0) {
    throw Error('网址解析到非公网地址，已拒绝获取');
  }
  const hasIPv6 = answers.some(answer => answer?.family === 6 || isIP(answer?.address) === 6);
  const pref64 = hasIPv6 ? await getPref64(timeoutMs) : { available: true, prefixes: [] };
  const publicAnswers = [];
  for (const answer of answers) {
    if (!answer || typeof answer.address !== 'string' || !isIP(answer.address) || isIP(answer.address) !== answer.family
      || (answer.family === 6 && answer.address.includes('%'))) {
      throw Error('网址解析到非公网地址，已拒绝获取');
    }
    if (answer.family === 4) {
      if (!isPublicAddress(answer.address, 4)) throw Error('网址解析到非公网地址，已拒绝获取');
      publicAnswers.push(answer);
      continue;
    }
    if (answer.family !== 6) throw Error('网址解析到非公网地址，已拒绝获取');
    if (!pref64.available) continue;
    let translated = false;
    for (const prefix of pref64.prefixes) {
      if (!prefixedBy(ipv6Bytes(answer.address), prefix)) continue;
      const embeddedIPv4 = decodePref64Address(answer.address, prefix);
      if (!embeddedIPv4 || !isPublicAddress(embeddedIPv4, 4)) {
        throw Error('网址解析到非公网地址，已拒绝获取');
      }
      translated = true;
      break;
    }
    if (translated || isPublicAddress(answer.address, 6)) publicAnswers.push(answer);
    else throw Error('网址解析到非公网地址，已拒绝获取');
  }
  if (publicAnswers.length === 0) throw Error('网址解析到非公网地址，已拒绝获取');
  return publicAnswers[0];
}

function requestNode(url, { address, family, maxBytes, timeoutMs }) {
  const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
  const host = normalizedHostname(url);
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let settled = false;
    const fail = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const req = request(url, {
      method: 'GET',
      agent: false,
      autoSelectFamily: false,
      family,
      servername: isIP(host) ? undefined : host,
      headers: {
        accept: 'text/html,application/xhtml+xml,image/avif,image/webp,image/apng,*/*;q=0.8',
        'accept-encoding': 'identity',
        'user-agent': 'QidianBookmarkMetadata/1.0'
      },
      lookup: (requestedHost, options, callback) => {
        const normalizedRequestHost = requestedHost.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
        if (normalizedRequestHost !== host) return callback(Error('DNS 主机不匹配'));
        if (options?.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      },
      signal: AbortSignal.timeout(timeoutMs)
    }, response => {
      const declaredSize = Number(response.headers['content-length']);
      if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
        response.destroy(Error('远程响应过大'));
        fail(Error('远程响应过大'));
        return;
      }
      response.on('data', chunk => {
        size += chunk.length;
        if (size > maxBytes) {
          response.destroy(Error('远程响应过大'));
          req.destroy(Error('远程响应过大'));
          fail(Error('远程响应过大'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (settled) return;
        settled = true;
        resolve({ statusCode: response.statusCode || 0, headers: response.headers, body: Buffer.concat(chunks) });
      });
      response.on('error', fail);
    });
    req.on('error', fail);
    req.end();
  });
}

function decodeEntities(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? match;
    const hex = entity[1]?.toLowerCase() === 'x';
    const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isInteger(point) && point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
      ? String.fromCodePoint(point) : '\uFFFD';
  });
}

function plainText(value, maxLength) {
  return decodeEntities(value.replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, maxLength);
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const name = match[1].toLowerCase();
    if (name !== 'meta' && name !== 'link' && name !== 'base') result[name] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return result;
}

function extractDocument(body, pageURL) {
  const html = body.toString('utf8');
  const title = plainText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] || '', 500) || pageURL.hostname;
  const meta = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
  const description = plainText(meta.find(item => item.name?.toLowerCase() === 'description' || item.property?.toLowerCase() === 'og:description')?.content || '', 2000);
  const base = html.match(/<base\b[^>]*>/i)?.[0];
  const baseHref = base ? attributes(base).href : '';
  let baseURL = pageURL;
  try { if (baseHref) baseURL = new URL(baseHref, pageURL); } catch { /* Ignore malformed base elements. */ }
  const icon = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => attributes(match[0]))
    .find(item => /(?:^|\s)(?:icon|shortcut icon|apple-touch-icon)(?:\s|$)/i.test(item.rel || '') && item.href);
  let iconURL = new URL('/favicon.ico', pageURL).href;
  try { if (icon) iconURL = new URL(icon.href, baseURL).href; } catch { /* Keep the same-origin favicon fallback. */ }
  return { title, description, iconURL };
}

function imageType(body, contentType) {
  const mime = String(contentType || '').split(';', 1)[0].trim().toLowerCase();
  const bytes = body;
  const valid = (mime === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    || (mime === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    || (mime === 'image/gif' && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii')))
    || (mime === 'image/webp' && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP')
    || ((mime === 'image/x-icon' || mime === 'image/vnd.microsoft.icon') && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0);
  return valid ? mime : '';
}

export function createBookmarkMetadataFetcher({
  lookup = hostname => dnsLookup(hostname, { all: true, verbatim: true }),
  lookupIPv6 = hostname => dnsResolve6(hostname),
  request = requestNode,
  timeoutMs = TOTAL_TIMEOUT_MS,
  maxPageBytes = MAX_PAGE_BYTES,
  maxIconBytes = MAX_ICON_BYTES,
  pref64TimeoutMs = PREF64_TIMEOUT_MS,
  maxRedirects = MAX_REDIRECTS
} = {}) {
  async function get(url, maxBytes, deadline, getPref64, previous, redirects = 0) {
    const target = validateURL(url, previous);
    if (redirects > maxRedirects) throw Error('远程网址重定向次数过多');
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw Error('远程请求超时');
    const { address, family } = await resolvePublicAddress(normalizedHostname(target), lookup, remainingMs, getPref64);
    const requestTimeout = deadline - Date.now();
    if (requestTimeout <= 0) throw Error('远程请求超时');
    const response = await request(target, { address, family, maxBytes, timeoutMs: requestTimeout });
    const headers = Object.fromEntries(Object.entries(response.headers || {}).map(([key, value]) => [key.toLowerCase(), value]));
    if (redirectStatuses.has(response.statusCode)) {
      const location = headers.location;
      if (!location) throw Error('远程网址重定向地址无效');
      return get(new URL(location, target).href, maxBytes, deadline, getPref64, target, redirects + 1);
    }
    if (response.statusCode < 200 || response.statusCode >= 300) throw Error('远程网站暂时无法读取');
    if (headers['content-encoding'] && headers['content-encoding'] !== 'identity') throw Error('远程网站返回了不支持的压缩格式');
    const body = Buffer.from(response.body || []);
    if (body.byteLength > maxBytes) throw Error('远程响应过大');
    return { url: target, headers, body };
  }

  return async function fetchBookmarkMetadata(input) {
    const deadline = Date.now() + timeoutMs;
    let pref64Promise;
    const getPref64 = remainingMs => {
      if (!pref64Promise) pref64Promise = resolvePref64(lookupIPv6, Math.min(remainingMs, pref64TimeoutMs));
      return pref64Promise;
    };
    const page = await get(input, maxPageBytes, deadline, getPref64);
    const pageType = String(page.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
    if (!['text/html', 'application/xhtml+xml'].includes(pageType)) throw Error('网址未返回网页内容');
    const metadata = extractDocument(page.body, page.url);
    let favicon = null;
    try {
      const icon = await get(metadata.iconURL, maxIconBytes, deadline, getPref64, page.url);
      const mime = imageType(icon.body, icon.headers['content-type']);
      if (mime) favicon = { mime, bytes: icon.body };
    } catch { /* Metadata remains useful when a site's icon is absent or unsafe. */ }
    return { title: metadata.title, description: metadata.description, favicon };
  };
}
