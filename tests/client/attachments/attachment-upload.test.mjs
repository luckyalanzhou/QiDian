import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttachmentUploadFlow } from '../../../src/features/editor/attachment-upload.ts';

function makeHarness(upload) {
  const events = [];
  const flow = createAttachmentUploadFlow({
    upload: async file => { events.push(['upload-start', file.name]); return upload(file, events); },
    insertHTML: html => events.push(['insert', html]),
    escapeHTML: value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]),
    notify: message => events.push(['notify', message])
  });
  return { flow, events };
}

test('attachment uploads are sequential and insert an escaped private download link', async () => {
  const harness = makeHarness(async (file, events) => {
    await Promise.resolve();
    events.push(['upload-finish', file.name]);
    return { url: `/api/assets/${file.name}?source=note&part=1`, name: '<guide>.pdf', size: 1536 };
  });

  await harness.flow.insertFiles([{ name: 'first', size: 1 }, { name: 'second', size: 2 }]);

  assert.deepEqual(harness.events.map(event => event[0]), [
    'upload-start', 'upload-finish', 'insert', 'upload-start', 'upload-finish', 'insert'
  ]);
  assert.deepEqual(harness.events.filter(event => event[0] === 'insert').map(event => event[1]), [
    '<p>📎 <a href="/api/assets/first?source=note&amp;part=1&amp;download=1">&lt;guide&gt;.pdf</a> (1.5 KB)</p>',
    '<p>📎 <a href="/api/assets/second?source=note&amp;part=1&amp;download=1">&lt;guide&gt;.pdf</a> (1.5 KB)</p>'
  ]);
});

test('a failed upload is reported and does not stop remaining files', async () => {
  const harness = makeHarness(async file => {
    if (file.name === 'broken') throw Error('上传失败');
    return { url: '/api/assets/ok', name: file.name, size: file.size };
  });

  await harness.flow.insertFiles([{ name: 'broken', size: 1024 }, { name: 'ok.txt', size: 2048 }]);

  assert.deepEqual(harness.events.filter(event => event[0] === 'notify'), [['notify', '上传失败']]);
  assert.equal(harness.events.filter(event => event[0] === 'insert').length, 1);
  assert.match(harness.events.find(event => event[0] === 'insert')[1], /ok\.txt/);
});

test('an invalid upload response does not create a link', async () => {
  const harness = makeHarness(async () => ({ url: '', name: 'missing', size: 0 }));

  await harness.flow.insertFiles([{ name: 'missing', size: 0 }]);

  assert.deepEqual(harness.events.filter(event => event[0] === 'notify'), [['notify', '附件上传响应无效']]);
  assert.equal(harness.events.some(event => event[0] === 'insert'), false);
});
