import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../../server/validation.js';
import { createBookmarkMetadataRoute } from '../../server/features/bookmark-metadata.js';

const request = new Request('https://qidian.test/api/bookmark-metadata', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/' })
});

test('bookmark metadata route returns bounded text and base64 icon data through its API contract', async () => {
  let fetchedUrl = '';
  const steps = [];
  const env = { DB: {} };
  const route = createBookmarkMetadataRoute(async url => {
    steps.push('fetch');
    fetchedUrl = url;
    return { title: 'Example', description: 'Summary', favicon: { mime: 'image/png', bytes: Buffer.from([1, 2, 3]) } };
  }, async (receivedEnv, receivedRequest, action, accountId, limits) => {
    steps.push('throttle');
    assert.equal(receivedEnv, env);
    assert.equal(receivedRequest, request);
    assert.equal(action, 'bookmark-metadata');
    assert.equal(accountId, 'account-1');
    assert.deepEqual(limits, { ipLimit: 60, identityLimit: 30, windowMs: 15 * 60 * 1000 });
  });
  const response = await route({
    request, env, accountId: 'account-1', path: '/api/bookmark-metadata',
    readJson: async (_request, limit, contract) => {
      steps.push('parse');
      assert.equal(limit, 4096);
      assert.equal(contract, 'bookmarkMetadataRequest');
      return { url: 'https://example.com/' };
    },
    json: (body, status, headers, contract) => ({ body, status, headers, contract })
  });
  assert.equal(fetchedUrl, 'https://example.com/');
  assert.deepEqual(steps, ['throttle', 'parse', 'fetch']);
  assert.deepEqual(response, {
    body: { title: 'Example', description: 'Summary', favicon: { mime: 'image/png', data: 'AQID' } },
    status: 200, headers: { 'Cache-Control': 'private, no-store' }, contract: 'bookmarkMetadata'
  });
});

test('bookmark metadata route hides outbound fetch details and permits manual entry after failure', async () => {
  const route = createBookmarkMetadataRoute(async () => { throw Error('connection to private upstream leaked'); }, async () => {});
  await assert.rejects(route({ request, path: '/api/bookmark-metadata', readJson: async () => ({ url: 'https://example.com/' }), json: () => null }),
    error => error instanceof HttpError && error.status === 422 && error.message === '无法安全获取网页信息，请手动填写');
});

test('bookmark metadata route ignores unrelated requests', async () => {
  const route = createBookmarkMetadataRoute(async () => assert.fail('unrelated requests must not fetch'));
  assert.equal(await route({ request, path: '/api/vault', json: () => null, readJson: () => null }), null);
  assert.equal(await route({ request: new Request('https://qidian.test/api/bookmark-metadata'), path: '/api/bookmark-metadata', json: () => null, readJson: () => null }), null);
});
