import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupWorkflows } from '../../../src/features/settings/backup-workflows.ts';

const vault = (title = '当前内容') => ({ notes: [{ id: title, title, body: '<p>正文</p>' }], theme: 'light', trash: [] });

function makeHarness(options = {}) {
  const events = [];
  let importAttempts = 0;
  const current = vault();
  const restored = options.restored || vault('历史内容');
  const workflows = createBackupWorkflows({
    localPreview: options.localPreview ?? false,
    getData: () => { events.push(['get-data']); return structuredClone(current); },
    saveActiveEditor: async () => { events.push(['save-editor']); if (options.saveError) throw Error(options.saveError); },
    flush: async () => { events.push(['flush']); return options.flushResult ?? true; },
    getLastError: () => options.flushError || '同步失败',
    confirmAction: async (message, config) => { events.push(['confirm', message, config]); return options.confirmed ?? true; },
    getBackup: async revision => { events.push(['get-backup', revision]); if (options.backupError) throw Error(options.backupError); return structuredClone(options.snapshot || restored); },
    exportBackup: async data => { events.push(['export-backup', structuredClone(data)]); if (options.exportError) throw Error(options.exportError); },
    createBackupSnapshot: async () => { events.push(['create-snapshot']); if (options.snapshotError) throw Error(options.snapshotError); },
    prepareBackup: async file => { events.push(['prepare-backup', file]); if (options.readError) throw Error(options.readError); return { data: structuredClone(restored), assetsToUpload: options.assetsToUpload ?? (options.localPreview ? 0 : 1) }; },
    uploadPreparedBackup: async (prepared, scopeId) => { events.push(['upload-prepared', prepared, scopeId]); if (options.uploadError) throw Error(options.uploadError); return structuredClone(restored); },
    validateVault: data => { events.push(['validate', structuredClone(data)]); if (options.validationError) throw Error(options.validationError); return data; },
    cleanHTML: html => `safe:${html || ''}`,
    commitSave: async data => { events.push(['commit-save', structuredClone(data)]); if (options.commitError) throw Error(options.commitError); },
    beginImport: () => events.push(['begin-import']),
    prepareImport: async () => { events.push(['prepare-import']); return 8; },
    createImportScope: async () => { events.push(['create-import-scope']); return { id:'123e4567-e89b-42d3-a456-426614174000' }; },
    abortImportScope: async id => { events.push(['abort-import-scope', id]); return { status:options.abortCommitted ? 'committed' : 'aborted', resultRevision:9 }; },
    commitImport: async (revision, scopeId, data) => { events.push(['commit-import', revision, scopeId, structuredClone(data)]); importAttempts++; if (options.commitError && (!options.abortCommitted || importAttempts === 1)) throw options.commitError instanceof Error ? options.commitError : Error(options.commitError); return { revision:9 }; },
    finishImport: () => events.push(['finish-import']),
    setImportProgress: progress => events.push(['import-progress', progress]),
    replaceWorkspace: (data, mode) => events.push(['replace-workspace', structuredClone(data), mode]),
    downloadJSON: (data, filename) => events.push(['download', structuredClone(data), filename]),
    pruneAssets: async () => { events.push(['prune-assets']); if (options.pruneError) throw Error(options.pruneError); },
    clearImportFile: () => events.push(['clear-import-file']),
    notify: message => events.push(['notify', message])
  });
  return { workflows, events, current };
}

test('history restore backs up and snapshots current data before the SQLite replacement', async () => {
  const harness = makeHarness();
  await harness.workflows.restoreSnapshot(12);
  const names = harness.events.map(event => event[0]);
  assert.ok(names.indexOf('save-editor') < names.indexOf('flush'));
  assert.ok(names.indexOf('flush') < names.indexOf('create-snapshot'));
  assert.ok(names.indexOf('create-snapshot') < names.indexOf('commit-save'));
  assert.ok(names.indexOf('commit-save') < names.indexOf('replace-workspace'));
  assert.deepEqual(harness.events.find(event => event[0] === 'replace-workspace')[1].notes[0].body, 'safe:<p>正文</p>');
  assert.equal(harness.events.find(event => event[0] === 'replace-workspace')[2], 'restore');
  assert.equal(harness.events.find(event => event[0] === 'notify')[1], '历史版本已恢复');
});

test('history restore reports committed success when post-restore asset cleanup fails', async () => {
  const harness = makeHarness({ pruneError: '磁盘暂时不可用' });

  await harness.workflows.restoreSnapshot(12);

  const names = harness.events.map(event => event[0]);
  assert.ok(names.indexOf('commit-save') < names.indexOf('replace-workspace'));
  const notice = harness.events.find(event => event[0] === 'notify')[1];
  assert.match(notice, /^历史版本已恢复/);
  assert.match(notice, /附件清理未完成：磁盘暂时不可用/);
  assert.doesNotMatch(notice, /恢复未完成/);
});

test('cancelled history restore performs no backup, snapshot, or replacement', async () => {
  const harness = makeHarness({ confirmed: false });
  await harness.workflows.restoreSnapshot(12);
  assert.deepEqual(harness.events.map(event => event[0]), ['confirm']);
});

test('failed history replacement leaves the current workspace in place', async () => {
  const harness = makeHarness({ commitError: '服务端提交失败' });
  await harness.workflows.restoreSnapshot(12);
  assert.equal(harness.events.some(event => event[0] === 'replace-workspace'), false);
  assert.ok(harness.events.some(event => event[0] === 'notify' && /恢复未完成：服务端提交失败/.test(event[1])));
});

test('backup import validates before asking to replace data, then snapshots and stages attachments', async () => {
  const harness = makeHarness();
  const file = { name: 'backup.json' };
  await harness.workflows.importBackup(file);
  const names = harness.events.map(event => event[0]);
  assert.ok(names.indexOf('prepare-backup') < names.indexOf('confirm'));
  assert.ok(names.indexOf('confirm') < names.indexOf('save-editor'));
  assert.ok(names.indexOf('save-editor') < names.indexOf('flush'));
  assert.ok(names.indexOf('flush') < names.indexOf('create-snapshot'));
  assert.ok(names.indexOf('create-snapshot') < names.indexOf('prepare-import'));
  assert.ok(names.indexOf('prepare-import') < names.indexOf('create-import-scope'));
  assert.ok(names.indexOf('create-import-scope') < names.indexOf('upload-prepared'));
  assert.ok(names.indexOf('commit-import') < names.indexOf('replace-workspace'));
  assert.equal(names.includes('commit-save'), false, 'the replacement never enters the retryable normal save queue');
  assert.equal(harness.events.find(event => event[0] === 'prepare-backup')[1], file);
  assert.equal(harness.events.find(event => event[0] === 'upload-prepared')[2], '123e4567-e89b-42d3-a456-426614174000');
  assert.equal(names.includes('export-backup'), false, 'a hidden browser download is not used as a rollback copy');
  assert.equal(harness.events.find(event => event[0] === 'replace-workspace')[2], 'import');
  assert.equal(harness.events.find(event => event[0] === 'notify')[1], '导入完成，知识库已更新');
  assert.equal(names.at(-1), 'clear-import-file');
});

test('backup import creates a commit scope when no attachment needs uploading', async () => {
  const harness = makeHarness({ assetsToUpload: 0 });

  await harness.workflows.importBackup({ name: 'backup-without-new-assets.zip' });

  const names = harness.events.map(event => event[0]);
  assert.ok(names.includes('create-import-scope'), 'the atomic server import still requires a scope without new uploads');
  assert.equal(harness.events.find(event => event[0] === 'upload-prepared')[2], '123e4567-e89b-42d3-a456-426614174000');
  assert.equal(harness.events.find(event => event[0] === 'commit-import')[2], '123e4567-e89b-42d3-a456-426614174000');
  assert.equal(harness.events.find(event => event[0] === 'notify')[1], '导入完成，知识库已更新');
});

test('backup import reports committed success when post-import asset cleanup fails', async () => {
  const harness = makeHarness({ pruneError: '磁盘暂时不可用' });

  await harness.workflows.importBackup({ name: 'backup.json' });

  const names = harness.events.map(event => event[0]);
  assert.ok(names.indexOf('commit-import') < names.indexOf('replace-workspace'));
  const notice = harness.events.find(event => event[0] === 'notify')[1];
  assert.match(notice, /^导入完成，知识库已更新/);
  assert.match(notice, /附件清理未完成：磁盘暂时不可用/);
  assert.doesNotMatch(notice, /导入失败/);
  assert.equal(names.at(-1), 'clear-import-file');
});

test('local preview backup import does not claim to create a server snapshot or write Docker data', async () => {
  const harness = makeHarness({ localPreview: true });
  await harness.workflows.importBackup({ name: 'backup.json' });
  const confirmation = harness.events.find(event => event[0] === 'confirm')[1];
  const notification = harness.events.find(event => event[0] === 'notify')[1];
  assert.doesNotMatch(confirmation, /服务端快照/);
  assert.equal(notification, '导入完成，本地预览数据已更新');
  assert.equal(harness.events.some(event => event[0] === 'create-import-scope'), false);
  assert.equal(harness.events.some(event => event[0] === 'commit-save'), false);
});

test('cancelled backup import never changes data and still clears the file input', async () => {
  const harness = makeHarness({ confirmed: false });
  await harness.workflows.importBackup({ name: 'backup.json' });
  const names = harness.events.map(event => event[0]);
  assert.ok(names.indexOf('prepare-backup') < names.indexOf('confirm'));
  assert.equal(names.includes('save-editor'), false);
  assert.equal(names.includes('create-snapshot'), false);
  assert.equal(names.includes('replace-workspace'), false);
  assert.equal(names.at(-1), 'clear-import-file');
});

test('malformed JSON backup shows a useful message before confirmation and keeps the current vault', async () => {
  const harness = makeHarness({ readError: `Unexpected token 'i', "{ invalid }" is not valid JSON` });

  await harness.workflows.importBackup({ name: 'invalid.zip' });

  const names = harness.events.map(event => event[0]);
  assert.equal(names.includes('confirm'), false);
  assert.equal(names.includes('save-editor'), false);
  assert.equal(names.includes('flush'), false);
  assert.equal(names.includes('create-snapshot'), false);
  assert.equal(names.includes('replace-workspace'), false);
  assert.ok(names.includes('begin-import'));
  assert.ok(names.includes('finish-import'));
  assert.ok(harness.events.some(event => event[0] === 'notify' && event[1] === '导入失败：备份文件格式无效。请选择栖点导出的 JSON 或 ZIP 备份；当前知识库未更改。'));
  assert.equal(names.at(-1), 'clear-import-file');
});

test('failed backup import removes staged chunks and does not prune account-wide attachments', async () => {
  const harness = makeHarness({ uploadError: '附件上传失败' });

  await harness.workflows.importBackup({ name: 'invalid.zip' });

  assert.equal(harness.events.some(event => event[0] === 'prune-assets'), false);
  assert.equal(harness.events.some(event => event[0] === 'replace-workspace'), false);
  assert.equal(harness.events.some(event => event[0] === 'abort-import-scope'), true);
  assert.ok(harness.events.some(event => event[0] === 'notify' && event[1] === '导入失败：附件上传失败'));
});

test('a rejected attachment reference aborts the staging scope without replacing the workspace', async () => {
  const error = Object.assign(new Error('备份引用的附件不存在或尚未上传完成，请重新导入'), { status:422 });
  const harness = makeHarness({ commitError:error });

  await harness.workflows.importBackup({ name:'incomplete-attachment.zip' });

  const names = harness.events.map(event => event[0]);
  assert.ok(names.includes('abort-import-scope'));
  assert.equal(names.includes('replace-workspace'),false);
  assert.equal(names.includes('prune-assets'),false);
  assert.ok(harness.events.some(event => event[0] === 'notify' && /附件不存在/.test(event[1])));
});

test('a lost import response is reconciled through the committed scope before workspace replacement', async () => {
  const harness = makeHarness({ commitError:'网络响应丢失', abortCommitted:true });
  await harness.workflows.importBackup({ name:'backup.zip' });
  const names = harness.events.map(event => event[0]);
  assert.equal(names.filter(name => name === 'commit-import').length, 2, 'retry returns the stored revision without enqueuing a save');
  assert.ok(names.indexOf('abort-import-scope') < names.lastIndexOf('commit-import'));
  assert.ok(names.lastIndexOf('commit-import') < names.indexOf('replace-workspace'));
  assert.equal(names.includes('commit-save'), false);
  assert.ok(harness.events.some(event => event[0] === 'notify' && /^导入完成/.test(event[1])));
});

test('full export reports failure without silently downloading a partial JSON fallback', async () => {
  const harness = makeHarness({ exportError: '附件读取失败' });
  await harness.workflows.exportFullBackup();
  assert.equal(harness.events.some(event => event[0] === 'download'), false);
  assert.ok(harness.events.some(event => event[0] === 'notify' && /完整备份失败：附件读取失败/.test(event[1])));
});
