import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountEditorFileInputEvents } from '../../../src/features/editor/file-input-events.ts';
import { mountBackupImportFileEvents } from '../../../src/features/settings/import-file-events.ts';

test('editor file inputs route attachment and image files and clear each input for reuse', () => {
  const dom = new JSDOM('<input id="attachmentFile" type="file" multiple><input id="imageFile" type="file" multiple><input id="importFile" type="file">');
  const { document, File, Event } = dom.window;
  const attachment = new File(['attachment'], 'guide.txt');
  const image = new File(['image'], 'diagram.png', { type: 'image/png' });
  const handled = [];
  const stop = mountEditorFileInputEvents(document, {
    uploadAttachments: files => handled.push(['attachments', files.map(file => file.name)]),
    storeImages: files => handled.push(['images', files.map(file => file.name)])
  });

  for (const [id, files, originalValue] of [
    ['attachmentFile', [attachment], 'C:\\fakepath\\guide.txt'],
    ['imageFile', [image], 'C:\\fakepath\\diagram.png']
  ]) {
    const input = document.querySelector(`#${id}`);
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    Object.defineProperty(input, 'value', { configurable: true, writable: true, value: originalValue });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    assert.equal(input.value, '', 'the file input resets so the same file can be selected again');
  }

  assert.deepEqual(handled, [['attachments', ['guide.txt']], ['images', ['diagram.png']]]);
  stop();
  document.querySelector('#imageFile').dispatchEvent(new Event('change', { bubbles: true }));
  assert.equal(handled.length, 2, 'unmounting removes the editor listener');
  dom.window.close();
});

test('backup import input forwards one selected file and clears the picker', () => {
  const dom = new JSDOM('<input id="importFile" type="file">');
  const { document, File, Event } = dom.window;
  const backup = new File(['{}'], 'qidian-backup.json', { type: 'application/json' });
  const imported = [];
  const input = document.querySelector('#importFile');
  Object.defineProperty(input, 'files', { configurable: true, value: [backup] });
  Object.defineProperty(input, 'value', { configurable: true, writable: true, value: 'C:\\fakepath\\qidian-backup.json' });
  const stop = mountBackupImportFileEvents(document, file => imported.push(file.name));

  input.dispatchEvent(new Event('change', { bubbles: true }));
  assert.deepEqual(imported, ['qidian-backup.json']);
  assert.equal(input.value, '');
  stop();
  dom.window.close();
});
