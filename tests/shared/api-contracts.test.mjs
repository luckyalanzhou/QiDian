import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  API_REQUEST_NAMES,
  API_RESPONSE_NAMES,
  isApiRequest,
  isApiResponse
} from '../../shared/api-contracts.js';

const examples = JSON.parse(await readFile(new URL('../fixtures/api-contract-examples.json', import.meta.url), 'utf8'));

test('shared API request examples cover and satisfy every runtime contract', () => {
  assert.deepEqual(Object.keys(examples.requests).sort(), [...API_REQUEST_NAMES].sort());
  for (const [name, value] of Object.entries(examples.requests)) {
    assert.equal(isApiRequest(name, value), true, `请求契约 ${name} 的示例未通过运行时校验`);
  }
});

test('shared API response examples cover and satisfy every runtime contract', () => {
  assert.deepEqual(Object.keys(examples.responses).sort(), [...API_RESPONSE_NAMES].sort());
  for (const [name, value] of Object.entries(examples.responses)) {
    assert.equal(isApiResponse(name, value), true, `响应契约 ${name} 的示例未通过运行时校验`);
  }
});

test('account mutation response contracts reject incomplete or unsuccessful results', () => {
  assert.equal(isApiResponse('accountAvatarMutation', { ok: false }), false);
  assert.equal(isApiResponse('accountPasswordMutation', { ok: true }), false);
});

test('bookmark metadata contracts bound URLs and raster favicon payloads', () => {
  assert.equal(isApiRequest('bookmarkMetadataRequest', { url: 'https://example.com/' }), true);
  assert.equal(isApiRequest('bookmarkMetadataRequest', { url: 'file:///etc/passwd' }), false);
  assert.equal(isApiResponse('bookmarkMetadata', { title: 'Example', description: 'Summary', favicon: null }), true);
  assert.equal(isApiResponse('bookmarkMetadata', { title: 'Example', description: '', favicon: { mime: 'image/svg+xml', data: 'PHN2Zy8+' } }), false);
});
