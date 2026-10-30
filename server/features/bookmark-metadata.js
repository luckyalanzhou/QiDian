import { HttpError } from '../validation.js';
import { createBookmarkMetadataFetcher } from '../adapters/bookmark-metadata-fetcher.mjs';
import { throttleAuth } from '../auth.js';

const fetchBookmarkMetadata = createBookmarkMetadataFetcher();

export function createBookmarkMetadataRoute(fetchMetadata = fetchBookmarkMetadata, rateLimit = throttleAuth) {
  return async function handleBookmarkMetadataRoute({ request, env, accountId, path, json, readJson }) {
    if (path !== '/api/bookmark-metadata' || request.method !== 'POST') return null;
    await rateLimit(env, request, 'bookmark-metadata', accountId, {
      ipLimit: 60,
      identityLimit: 30,
      windowMs: 15 * 60 * 1000
    });
    const { url } = await readJson(request, 4096, 'bookmarkMetadataRequest');
    let metadata;
    try { metadata = await fetchMetadata(url); }
    catch { throw new HttpError(422, '无法安全获取网页信息，请手动填写'); }
    const favicon = metadata.favicon ? {
      mime: metadata.favicon.mime,
      data: Buffer.from(metadata.favicon.bytes).toString('base64')
    } : null;
    return json({ title: metadata.title, description: metadata.description, favicon }, 200, { 'Cache-Control': 'private, no-store' }, 'bookmarkMetadata');
  };
}

export const handleBookmarkMetadataRoute = createBookmarkMetadataRoute();
