import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createHtmlExportService } from '../src/features/notes/html-export-service.ts';

const imageId = '11111111-1111-4111-8111-111111111111';
const fileId = '22222222-2222-4222-8222-222222222222';

function readBlob(window, blob, method) {
  return new Promise((resolve, reject) => {
    const reader = new window.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader[method](blob);
  });
}

test('HTML export embeds private image and attachment assets while preserving external links', async () => {
  const dom = new JSDOM('<!doctype html>');
  const calls = [];
  let download;
  const service = createHtmlExportService({
    platform: dom.window,
    getAssetResponse: async (id, asDownload) => {
      calls.push([id, asDownload]);
      const bytes = id === imageId ? [137, 80, 78, 71] : [80, 68, 70];
      const type = id === imageId ? 'image/png' : 'application/pdf';
      return { blob: async () => new dom.window.Blob([new Uint8Array(bytes)], { type }) };
    },
    download: (blob, name) => { download = { blob, name }; }
  });

  await service.exportHTML(
    { title: '说明 <导出>', body: '' },
    `<p><img src="/api/assets/${imageId}"></p><a href="/api/assets/${fileId}?download=1" target="_blank">说明书.pdf</a><a href="https://example.com" target="_blank">外部链接</a>`
  );

  assert.deepEqual(calls, [[imageId, false], [fileId, true]]);
  assert.equal(download.name, '说明 <导出>.html');
  assert.equal(download.blob.type, 'text/html');
  const html = await readBlob(dom.window, download.blob, 'readAsText');
  const result = new dom.window.DOMParser().parseFromString(html, 'text/html');

  assert.equal(result.title, '说明 <导出>');
  assert.equal(result.querySelector('h1')?.textContent, '说明 <导出>');
  assert.equal(result.querySelector('meta[charset="utf-8"]') !== null, true);
  assert.match(result.querySelector('style')?.textContent ?? '', /max-width:900px/);
  assert.equal(result.querySelector('img')?.getAttribute('src'), 'data:image/png;base64,iVBORw==');
  const attachment = result.querySelector(`a[download="说明书.pdf"]`);
  assert.equal(attachment?.getAttribute('href'), 'data:application/octet-stream;base64,UERG');
  assert.equal(attachment?.hasAttribute('target'), false);
  assert.equal(result.querySelector('a[href="https://example.com"]')?.getAttribute('target'), '_blank');

  dom.window.close();
});

test('HTML export skips non-local and malformed asset URLs and reports asset read failures', async () => {
  const dom = new JSDOM('<!doctype html>');
  let assetRequests = 0;
  let downloads = 0;
  const service = createHtmlExportService({
    platform: dom.window,
    getAssetResponse: async () => { assetRequests += 1; throw new Error('asset unavailable'); },
    download: () => { downloads += 1; }
  });

  await service.exportHTML({ title: 'External', body: '' }, '<a href="https://example.com">site</a><img src="/api/assets/not-an-id">');
  assert.equal(assetRequests, 0);
  assert.equal(downloads, 1);

  await assert.rejects(
    service.exportHTML({ title: 'Broken', body: '' }, `<img src="/api/assets/${imageId}">`),
    /asset unavailable/
  );
  assert.equal(downloads, 1);
  dom.window.close();
});
