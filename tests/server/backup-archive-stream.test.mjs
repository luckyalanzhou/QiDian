import test from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, unzipSync, strFromU8, zipSync } from 'fflate';
import { createZip64StoreStream, zip64StreamInternals } from '../../server/adapters/zip64-store-stream.mjs';
import { backupArchiveStreamInternals, parseBackupFile, streamBackupZipEntry } from '../../src/features/settings/backup-archive-stream.ts';
import { createBackupArchive } from '../../src/features/settings/backup-archive.ts';

const id = '123e4567-e89b-42d3-a456-426614174000';
const MAX_BACKUP_METADATA_BYTES = 64 * 1024 * 1024;
const vault = { notes: [{ id: 'note-1', title: 'Stream', body: `<img src="/api/assets/${id}">` }], bookmarks: [], categories: [], trash: [] };
const asset = new Uint8Array(Array.from({ length: 260_000 }, (_, index) => (index * 17) & 0xff));

async function readStream(stream) {
  const reader = stream.getReader(), chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); size += value.byteLength;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function bytesStream(bytes) {
  return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
}

test('server and browser CRC32 implementations match the standard vector and arbitrary chunk boundaries', () => {
  const sample = new TextEncoder().encode('123456789');
  const payload = Uint8Array.from({ length: 4097 }, (_, index) => (index * 73 + 19) & 0xff);
  const implementations = [
    ['ZIP64 writer', zip64StreamInternals.crc32Update],
    ['browser importer', backupArchiveStreamInternals.updateCrc32]
  ];

  for (const [name, update] of implementations) {
    assert.equal(((update(0xffff_ffff, sample) ^ 0xffff_ffff) >>> 0), 0xcbf43926, `${name} standard vector`);
    const expected = update(0xffff_ffff, payload);
    for (const chunkSize of [1, 7, 8, 9, 63, 64, 255, 256, 1024]) {
      let actual = 0xffff_ffff;
      for (let offset = 0; offset < payload.length; offset += chunkSize) {
        const view = new Uint8Array(payload.buffer, payload.byteOffset + offset, Math.min(chunkSize, payload.length - offset));
        actual = update(actual, view);
        if (offset === 0) actual = update(actual, new Uint8Array());
      }
      assert.equal(actual, expected, `${name} ${chunkSize}-byte chunks`);
    }
  }
});

function zip64Directory(bytes, { locatorDisk = 0, diskCount = 1 } = {}) {
  let eocdOffset = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (bytes[offset] === 0x50 && bytes[offset + 1] === 0x4b && bytes[offset + 2] === 0x05 && bytes[offset + 3] === 0x06) {
      eocdOffset = offset;
      break;
    }
  }
  assert.notEqual(eocdOffset, -1, 'source archive has a classic end record');
  const originalView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = originalView.getUint16(eocdOffset + 10, true);
  const centralSize = originalView.getUint32(eocdOffset + 12, true);
  const centralOffset = originalView.getUint32(eocdOffset + 16, true);
  const output = new Uint8Array(bytes.length + 76);
  output.set(bytes.subarray(0, eocdOffset));
  const view = new DataView(output.buffer);
  const zip64Offset = eocdOffset;
  view.setUint32(zip64Offset, 0x06064b50, true);
  view.setBigUint64(zip64Offset + 4, 44n, true);
  view.setUint16(zip64Offset + 12, 45, true);
  view.setUint16(zip64Offset + 14, 45, true);
  view.setUint32(zip64Offset + 16, 0, true);
  view.setUint32(zip64Offset + 20, 0, true);
  view.setBigUint64(zip64Offset + 24, BigInt(entries), true);
  view.setBigUint64(zip64Offset + 32, BigInt(entries), true);
  view.setBigUint64(zip64Offset + 40, BigInt(centralSize), true);
  view.setBigUint64(zip64Offset + 48, BigInt(centralOffset), true);
  const locatorOffset = zip64Offset + 56;
  view.setUint32(locatorOffset, 0x07064b50, true);
  view.setUint32(locatorOffset + 4, locatorDisk, true);
  view.setBigUint64(locatorOffset + 8, BigInt(zip64Offset), true);
  view.setUint32(locatorOffset + 16, diskCount, true);
  output.set(bytes.subarray(eocdOffset), locatorOffset + 20);
  const classicOffset = locatorOffset + 20;
  view.setUint16(classicOffset + 8, 0xffff, true);
  view.setUint16(classicOffset + 10, 0xffff, true);
  view.setUint32(classicOffset + 12, 0xffff_ffff, true);
  view.setUint32(classicOffset + 16, 0xffff_ffff, true);
  return output;
}

function setStoredEntryUncompressedSize(bytes, name, size) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset + 46 <= bytes.byteLength; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const entryName = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (entryName !== name) continue;
    const localOffset = view.getUint32(offset + 42, true);
    view.setUint32(offset + 24, size, true);
    view.setUint32(localOffset + 22, size, true);
    return bytes;
  }
  throw new Error(`ZIP entry not found: ${name}`);
}

test('streaming ZIP64 store writer produces an archive readable by fflate and the streaming importer', async () => {
  const exportedAt = new Date().toISOString();
  const vaultBytes = strToU8(JSON.stringify({ version: 2, exportedAt, ...vault }));
  const manifestBytes = strToU8(JSON.stringify([{ id, name: 'asset.bin', size: asset.byteLength, mime: 'application/octet-stream', created: 1 }]));
  const archive = await readStream(createZip64StoreStream([
    { name: 'vault.json', size: vaultBytes.length, stream: bytesStream(vaultBytes) },
    { name: `assets/${id}`, size: asset.length, stream: new ReadableStream({
      start(controller) { controller.enqueue(asset.subarray(0, 131_071)); controller.enqueue(asset.subarray(131_071)); controller.close(); }
    }) },
    { name: 'assets.json', size: manifestBytes.length, stream: bytesStream(manifestBytes) }
  ]));

  const files = unzipSync(archive);
  assert.deepEqual(JSON.parse(strFromU8(files['vault.json'])).notes, vault.notes);
  assert.deepEqual(files[`assets/${id}`], asset);
  const parsed = await parseBackupFile(new File([archive], 'full.zip'), value => value);
  assert.deepEqual(parsed.data.notes, vault.notes);
  const entry = parsed.entries.get(`assets/${id}`);
  const restoredChunks = [];
  await streamBackupZipEntry(parsed.file, entry, chunk => restoredChunks.push(chunk));
  assert.deepEqual(Buffer.concat(restoredChunks.map(Buffer.from)), Buffer.from(asset));
});

test('cancelling a ZIP64 download cancels the active attachment source', async () => {
  let sourceCancelled = false;
  const source = new ReadableStream({
    start(controller) { controller.enqueue(Uint8Array.of(1)); },
    cancel() { sourceCancelled = true; }
  });
  const download = createZip64StoreStream([{ name:'assets/item', size:1, stream:source }]);
  const reader = download.getReader();

  await reader.read();
  await reader.read();
  await reader.cancel('client disconnected');

  assert.equal(sourceCancelled, true);
});

test('large ZIP64 streams yield to timers while computing checksums', async () => {
  const chunkSize = 256 * 1024;
  const chunkCount = 128;
  let nextChunk = 0;
  let timerTicks = 0;
  const timer = setInterval(() => { timerTicks += 1; }, 0);
  const source = new ReadableStream({
    pull(controller) {
      if (nextChunk === chunkCount) { controller.close(); return; }
      controller.enqueue(new Uint8Array(chunkSize));
      nextChunk += 1;
    }
  });
  let outputBytes = 0;

  try {
    for await (const chunk of createZip64StoreStream([{ name: 'assets/large', size: chunkSize * chunkCount, stream: source }])) {
      outputBytes += chunk.byteLength;
    }
  } finally {
    clearInterval(timer);
  }

  assert.ok(outputBytes > chunkSize * chunkCount);
  assert.ok(timerTicks > 0, 'the event loop should service timers before a 32 MiB entry finishes');
});

test('streaming importer reads legacy stored ZIP v2 and common Deflate archives', async () => {
  const stored = createBackupArchive(vault, [{ id, name: 'asset.bin', size: asset.length, bytes: asset }]);
  const deflated = zipSync({
    'vault.json': strToU8(JSON.stringify({ version: 2, ...vault })),
    [`assets/${id}`]: asset,
    'assets.json': strToU8(JSON.stringify([{ id, name: 'asset.bin', size: asset.length }]))
  }, { level: 6 });

  for (const bytes of [stored, deflated]) {
    const parsed = await parseBackupFile(new File([bytes], 'backup.zip'), value => value);
    const actual = [];
    await streamBackupZipEntry(parsed.file, parsed.entries.get(`assets/${id}`), chunk => actual.push(chunk));
    assert.deepEqual(Buffer.concat(actual.map(Buffer.from)), Buffer.from(asset));
  }
});

test('streaming importer accepts a small single-disk ZIP64 archive with a 32-bit directory offset', async () => {
  const archive = zip64Directory(createBackupArchive(vault, []));
  assert.ok(archive.byteLength < 0x1_0000_0000);

  const parsed = await parseBackupFile(new File([archive], 'small-zip64.zip'), value => value);

  assert.deepEqual(parsed.data.notes, vault.notes);
  assert.ok(parsed.entries.has('assets.json'));
});

test('streaming importer rejects ZIP64 locators that point to another disk or declare multiple disks', async () => {
  const original = createBackupArchive(vault, []);
  const malformed = [zip64Directory(original, { locatorDisk: 1 }), zip64Directory(original, { diskCount: 2 })];

  for (const archive of malformed) {
    await assert.rejects(parseBackupFile(new File([archive], 'split.zip'), value => value), /ZIP64 分卷信息无效/);
  }
});

test('streaming importer rejects an unknown filename before parsing later directory entries', async () => {
  const archive = zipSync({
    'README.md': strToU8('not a qidian backup'),
    'vault.json': strToU8(JSON.stringify({ version: 2, ...vault })),
    'assets.json': strToU8('[]')
  });
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const centralStart = view.getUint32(archive.byteLength - 22 + 16, true);
  let cursor = centralStart;
  const firstNameLength = view.getUint16(cursor + 28, true);
  const firstName = new TextDecoder().decode(archive.subarray(cursor + 46, cursor + 46 + firstNameLength));
  assert.equal(firstName, 'README.md');
  cursor += 46 + firstNameLength + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
  const secondNameLength = view.getUint16(cursor + 28, true);
  const secondName = new TextDecoder().decode(archive.subarray(cursor + 46, cursor + 46 + secondNameLength));
  assert.equal(secondName, 'vault.json');
  archive[cursor] = 0;

  await assert.rejects(
    parseBackupFile(new File([archive], 'unknown-entry.zip'), value => value),
    /备份包含未知文件/
  );
});

test('archive metadata declaring a multi-gigabyte entry is rejected before decompression', async () => {
  const original = createBackupArchive(vault, [{ id, name: 'asset.bin', size: asset.length, bytes: asset }]);
  const corrupted = original.slice();
  const centralOffset = corrupted.findIndex((byte, index) => byte === 0x50 && corrupted[index + 1] === 0x4b
    && corrupted[index + 2] === 0x01 && corrupted[index + 3] === 0x02);
  assert.ok(centralOffset > 0);
  new DataView(corrupted.buffer, corrupted.byteOffset, corrupted.byteLength).setUint32(centralOffset + 24, 0xffff_ffff, true);
  await assert.rejects(parseBackupFile(new File([corrupted], 'large.zip'), value => value), /ZIP64|不一致/);
});

test('streaming importer rejects changed attachment bytes when the ZIP CRC no longer matches', async () => {
  const original = createBackupArchive(vault, [{ id, name: 'asset.bin', size: asset.length, bytes: asset }]);
  const corrupted = original.slice();
  let centralOffset = -1;
  for (let index = 0; index + 4 <= corrupted.length; index += 1) {
    if (corrupted[index] === 0x50 && corrupted[index + 1] === 0x4b && corrupted[index + 2] === 0x01 && corrupted[index + 3] === 0x02) {
      const view = new DataView(corrupted.buffer, corrupted.byteOffset, corrupted.byteLength);
      const nameLength = view.getUint16(index + 28, true);
      const name = new TextDecoder().decode(corrupted.subarray(index + 46, index + 46 + nameLength));
      if (name === `assets/${id}`) { centralOffset = index; break; }
    }
  }
  assert.ok(centralOffset > 0);
  const centralView = new DataView(corrupted.buffer, corrupted.byteOffset, corrupted.byteLength);
  const localOffset = centralView.getUint32(centralOffset + 42, true);
  const localNameLength = centralView.getUint16(localOffset + 26, true);
  const localExtraLength = centralView.getUint16(localOffset + 28, true);
  corrupted[localOffset + 30 + localNameLength + localExtraLength] ^= 1;

  const parsed = await parseBackupFile(new File([corrupted], 'corrupt-crc.zip'), value => value);
  await assert.rejects(streamBackupZipEntry(parsed.file, parsed.entries.get(`assets/${id}`), () => {}), /校验值不符/);
});

test('ZIP64 writer emits 64-bit size fields and data descriptors above 4 GiB', () => {
  const size = 0x1_0000_0000n;
  const local = zip64StreamInternals.localHeader('assets/large', size);
  const localView = new DataView(local.bytes.buffer, local.bytes.byteOffset, local.bytes.byteLength);
  assert.equal(local.large, true);
  assert.equal(localView.getUint32(18, true), 0xffff_ffff);
  assert.equal(zip64StreamInternals.dataDescriptor(123, size).byteLength, 24);
  const ending = zip64StreamInternals.endRecords(1n, size, size);
  assert.deepEqual(ending.map(bytes => new DataView(bytes.buffer).getUint32(0, true)), [0x06064b50, 0x07064b50, 0x06054b50]);
  const classicEndView = new DataView(ending[2].buffer, ending[2].byteOffset, ending[2].byteLength);
  assert.equal(classicEndView.getUint16(4, true), 0, 'single-disk ZIP64 keeps disk numbers at zero');
  assert.equal(classicEndView.getUint16(6, true), 0);
  assert.equal(classicEndView.getUint16(8, true), 1, 'representable entry counts remain in the classic record');
  assert.equal(classicEndView.getUint16(10, true), 1);
  assert.equal(classicEndView.getUint32(12, true), 0xffff_ffff, 'oversized classic fields use ZIP64 sentinels');
  assert.equal(classicEndView.getUint32(16, true), 0xffff_ffff);
});

test('raw JSON backup metadata over 64 MiB is rejected before reading the file', async () => {
  let textRead = false;
  const file = {
    name: 'oversized.json',
    size: MAX_BACKUP_METADATA_BYTES + 1,
    async text() { textRead = true; return '{}'; }
  };

  await assert.rejects(parseBackupFile(file, value => value), /备份元数据超过 64 MiB/);
  assert.equal(textRead, false);
});

test('ZIP vault and asset manifest metadata over 64 MiB is rejected before decompression', async () => {
  for (const name of ['vault.json', 'assets.json']) {
    const archive = createBackupArchive(vault, []);
    setStoredEntryUncompressedSize(archive, name, MAX_BACKUP_METADATA_BYTES + 1);

    await assert.rejects(
      parseBackupFile(new File([archive], 'oversized-metadata.zip'), value => value),
      /备份元数据超过 64 MiB/,
      name
    );
  }
});

test('64 MiB metadata limit does not cap attachment entry size', async () => {
  const archive = zipSync({
    'vault.json': strToU8(JSON.stringify({ version: 2, ...vault })),
    [`assets/${id}`]: Uint8Array.of(1),
    'assets.json': strToU8(JSON.stringify([{ id, name: 'large.bin', size: MAX_BACKUP_METADATA_BYTES + 1 }]))
  }, { level: 0 });
  setStoredEntryUncompressedSize(archive, `assets/${id}`, MAX_BACKUP_METADATA_BYTES + 1);

  const parsed = await parseBackupFile(new File([archive], 'large-attachment.zip'), value => value);

  assert.equal(parsed.assets[0].size, MAX_BACKUP_METADATA_BYTES + 1);
  await assert.rejects(
    streamBackupZipEntry(parsed.file, parsed.entries.get(`assets/${id}`), () => {}),
    /长度或校验值不符/
  );
});
