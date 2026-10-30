import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVault as validateServerVault, HttpError } from '../../server/validation.js';
import { validateVault, VaultValidationError } from '../../shared/vault-validation.js';
import { bookmarkURL, validateBookmarks } from '../../shared/bookmarks.js';
import { bookmarkURL as serverBookmarkURL, validateBookmarks as validateServerBookmarks } from '../../server/bookmarks.js';
import { assertApiErrorResponse, isApiErrorResponse, isApiResponse } from '../../shared/api-contracts.js';

test('shared vault rules preserve the existing server normalization contract', () => {
  const legacy = { categories: ['开发'], notes: [], theme: 'dark', pasteMode: 'plain' };
  assert.deepEqual(validateVault(legacy), validateServerVault(legacy));
  assert.equal(validateServerVault(legacy).noteTypes[0].id, 'note');
  assert.deepEqual(validateServerVault(legacy).bookmarks, []);
  assert.deepEqual(validateServerVault(legacy).trash, []);
});

test('server adapter maps shared domain failures to the established HTTP error type', () => {
  assert.throws(() => validateVault(null), error => error instanceof VaultValidationError && error.status === 400);
  assert.throws(() => validateServerVault(null), error => error instanceof HttpError && error.status === 400);
});

test('browser and server use the same bookmark URL and tree rules', () => {
  const bookmarks = [{ id: 'links', kind: 'folder', title: '链接', children: [
    { id: 'qidian', kind: 'link', title: '栖点', url: 'https://example.com/path' }
  ] }];
  assert.equal(serverBookmarkURL, bookmarkURL);
  assert.equal(validateServerBookmarks, validateBookmarks);
  assert.deepEqual(validateBookmarks(bookmarks), bookmarks);
  assert.throws(() => validateBookmarks([{ id: 'unsafe', kind: 'link', title: '不安全', url: 'javascript:alert(1)' }]));
});

test('bookmark metadata is validated as plain text and a local asset URL', () => {
  const bookmarks = validateBookmarks([{
    id: 'metadata-link', kind: 'link', title: '资料', url: 'https://example.com/',
    description: '摘要 <script>文本</script>', favicon: '/api/assets/123e4567-e89b-42d3-a456-426614174000'
  }]);
  assert.equal(bookmarks[0].description, '摘要 <script>文本</script>');
  assert.equal(bookmarks[0].favicon, '/api/assets/123e4567-e89b-42d3-a456-426614174000');
  assert.throws(() => validateBookmarks([{ id: 'bad-icon', kind: 'link', title: 'A', url: 'https://example.com/', favicon: 'https://evil.example/icon.png' }]));
  assert.throws(() => validateBookmarks([{ id: 'long-description', kind: 'link', title: 'A', url: 'https://example.com/', description: 'x'.repeat(2001) }]));
});

test('API vault responses validate nested notes, bookmarks, trash and preferences', () => {
  const valid = validateVault({ categories: ['开发'], notes: [] });
  assert.equal(isApiResponse('vault', { revision: 3, data: valid }), true);

  const malformedNote = structuredClone(valid);
  malformedNote.notes.push({ id: 'bad-note' });
  assert.equal(isApiResponse('vault', { revision: 3, data: malformedNote }), false);

  const unsafeBookmark = structuredClone(valid);
  unsafeBookmark.bookmarks.push({ id: 'bad-link', kind: 'link', title: '不安全', url: 'javascript:alert(1)' });
  assert.equal(isApiResponse('vault', { revision: 3, data: unsafeBookmark }), false);

  const invalidPreference = structuredClone(valid);
  invalidPreference.dashboardBookmarkFolders = { folder: 'open' };
  assert.equal(isApiResponse('vault', { revision: 3, data: invalidPreference }), false);
});

test('shared API error contract validates common errors and authentication state', () => {
  const authError = { error:'请登录栖点账号', registrationEnabled:true, setupRequired:false };
  assert.equal(isApiErrorResponse(authError), true);
  assert.deepEqual(assertApiErrorResponse(authError), authError);
  assert.equal(isApiErrorResponse({ error:'版本冲突', code:'REVISION_MISMATCH' }), true);
  assert.equal(isApiErrorResponse({ error:'登录失败', registrationEnabled:'yes' }), false);
  assert.equal(isApiErrorResponse({ message:'服务器错误' }), false);
  assert.throws(() => assertApiErrorResponse(null), /API 错误响应不符合契约/);
});
