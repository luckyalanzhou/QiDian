import type { BackupAssetMetadata } from './backup-archive.ts';

const MAX_ARCHIVE_ENTRIES = 10_002;
const MAX_BACKUP_METADATA_BYTES = 64 * 1024 * 1024;
const UINT32_MAX = 0xffff_ffffn;
const utf8 = new TextDecoder('utf-8', { fatal: true });

export type BackupZipEntry = {
  name: string;
  method: number;
  flags: number;
  crc32: number;
  compressedSize: bigint;
  size: bigint;
  dataOffset: number;
};

export type ParsedBackupFile<T> = {
  data: T;
  assets: BackupAssetMetadata[];
  entries: Map<string, BackupZipEntry>;
  file: Blob & { name?: string };
};

type CentralEntry = BackupZipEntry & { localOffset: number; endOffset: number };

function u16(view: DataView, offset: number) { return view.getUint16(offset, true); }
function u32(view: DataView, offset: number) { return view.getUint32(offset, true); }
function u64(view: DataView, offset: number) { return view.getBigUint64(offset, true); }

function safeNumber(value: bigint, message: string) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw Error(message);
  return Number(value);
}

function isBackupEntryName(name: string) {
  return name === 'vault.json' || name === 'assets.json' || /^assets\/[a-f0-9-]{36}$/.test(name);
}

function assertBackupMetadataSize(size: bigint) {
  if (size > BigInt(MAX_BACKUP_METADATA_BYTES)) throw Error('备份元数据超过 64 MiB');
}

async function readSlice(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end > blob.size) {
    throw Error('备份 ZIP 偏移无效');
  }
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

function parseZip64Extra(extra: Uint8Array, sentinels: { size: boolean; compressedSize: boolean; localOffset: boolean; disk: boolean }) {
  const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
  let offset = 0;
  while (offset + 4 <= extra.length) {
    const id = u16(view, offset), length = u16(view, offset + 2);
    const end = offset + 4 + length;
    if (end > extra.length) throw Error('备份 ZIP 扩展字段无效');
    if (id === 1) {
      let valueOffset = offset + 4;
      const read64 = () => {
        if (valueOffset + 8 > end) throw Error('ZIP64 大小信息不完整');
        const value = u64(view, valueOffset);
        valueOffset += 8;
        return value;
      };
      const size = sentinels.size ? read64() : null;
      const compressedSize = sentinels.compressedSize ? read64() : null;
      const localOffset = sentinels.localOffset ? read64() : null;
      const disk = sentinels.disk ? (() => {
        if (valueOffset + 4 > end) throw Error('ZIP64 分卷信息不完整');
        return u32(view, valueOffset);
      })() : null;
      return { size, compressedSize, localOffset, disk };
    }
    offset = end;
  }
  if (offset !== extra.length) throw Error('备份 ZIP 扩展字段无效');
  return { size: null, compressedSize: null, localOffset: null, disk: null };
}

async function readCentralDirectory(file: Blob): Promise<CentralEntry[]> {
  if (!Number.isSafeInteger(file.size) || file.size < 22) throw Error('备份 ZIP 不完整');
  const tailStart = Math.max(0, file.size - 22 - 65_535);
  const tail = await readSlice(file, tailStart, file.size);
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (u32(tailView, offset) !== 0x06054b50) continue;
    const commentLength = u16(tailView, offset + 20);
    if (offset + 22 + commentLength === tail.length) { eocd = offset; break; }
  }
  if (eocd < 0) throw Error('备份 ZIP 结束目录缺失');
  const eocdOffset = tailStart + eocd;
  const classicDisk = u16(tailView, eocd + 4), classicCentralDisk = u16(tailView, eocd + 6);
  let count = BigInt(u16(tailView, eocd + 10));
  let centralSize = BigInt(u32(tailView, eocd + 12));
  let centralOffset = BigInt(u32(tailView, eocd + 16));
  const classicSentinel = count === 0xffffn || centralSize === UINT32_MAX || centralOffset === UINT32_MAX;
  if (classicDisk !== 0 || classicCentralDisk !== 0 || u16(tailView, eocd + 8) !== u16(tailView, eocd + 10)) {
    throw Error('备份 ZIP 不支持分卷');
  }

  const locatorOffset = eocdOffset - 20;
  if (locatorOffset >= 0) {
    const locator = await readSlice(file, locatorOffset, eocdOffset);
    const locatorView = new DataView(locator.buffer, locator.byteOffset, locator.byteLength);
    if (u32(locatorView, 0) === 0x07064b50) {
      if (u32(locatorView, 4) !== 0 || u32(locatorView, 16) !== 1) {
        throw Error('备份 ZIP64 分卷信息无效');
      }
      const zip64Offset = safeNumber(u64(locatorView, 8), 'ZIP64 目录偏移超出浏览器可处理范围');
      const zip64Head = await readSlice(file, zip64Offset, zip64Offset + 56);
      const zip64View = new DataView(zip64Head.buffer, zip64Head.byteOffset, zip64Head.byteLength);
      if (u32(zip64View, 0) !== 0x06064b50 || u64(zip64View, 4) < 44n) throw Error('ZIP64 结束目录无效');
      if (u32(zip64View, 16) !== 0 || u32(zip64View, 20) !== 0 || u64(zip64View, 24) !== u64(zip64View, 32)) {
        throw Error('备份 ZIP64 不支持分卷');
      }
      count = u64(zip64View, 32);
      centralSize = u64(zip64View, 40);
      centralOffset = u64(zip64View, 48);
    } else if (classicSentinel) {
      throw Error('备份 ZIP64 结束目录缺失');
    }
  } else if (classicSentinel) {
    throw Error('备份 ZIP64 结束目录缺失');
  }

  const entryCount = safeNumber(count, '备份包含过多文件');
  if (entryCount < 2 || entryCount > MAX_ARCHIVE_ENTRIES) throw Error('备份包含过多文件');
  const start = safeNumber(centralOffset, 'ZIP64 目录偏移超出浏览器可处理范围');
  const size = safeNumber(centralSize, 'ZIP64 目录超出浏览器可处理范围');
  const end = start + size;
  if (!Number.isSafeInteger(end) || start < 0 || end > eocdOffset) throw Error('备份 ZIP 目录范围无效');

  const entries: CentralEntry[] = [];
  const names = new Set<string>();
  let cursor = start;
  for (let index = 0; index < entryCount; index += 1) {
    const fixed = await readSlice(file, cursor, cursor + 46);
    const view = new DataView(fixed.buffer, fixed.byteOffset, fixed.byteLength);
    if (u32(view, 0) !== 0x02014b50) throw Error('备份 ZIP 中央目录无效');
    const flags = u16(view, 8), method = u16(view, 10), crc32 = u32(view, 16);
    const rawCompressed = BigInt(u32(view, 20)), rawSize = BigInt(u32(view, 24));
    const nameLength = u16(view, 28), extraLength = u16(view, 30), commentLength = u16(view, 32);
    const rawDisk = u16(view, 34), rawLocalOffset = BigInt(u32(view, 42));
    const variableEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (variableEnd > end) throw Error('备份 ZIP 中央目录长度无效');
    const variable = await readSlice(file, cursor + 46, variableEnd);
    const nameBytes = variable.subarray(0, nameLength);
    const name = (flags & 0x0800) ? utf8.decode(nameBytes) : (() => {
      if (nameBytes.some(byte => byte > 0x7f)) throw Error('备份 ZIP 文件名编码不受支持');
      return String.fromCharCode(...nameBytes);
    })();
    if (!isBackupEntryName(name)) throw Error('备份包含未知文件');
    const extra = variable.subarray(nameLength, nameLength + extraLength);
    const zip64 = parseZip64Extra(extra, {
      size: rawSize === UINT32_MAX,
      compressedSize: rawCompressed === UINT32_MAX,
      localOffset: rawLocalOffset === UINT32_MAX,
      disk: rawDisk === 0xffff
    });
    const uncompressed = zip64.size ?? rawSize;
    const compressed = zip64.compressedSize ?? rawCompressed;
    const localOffsetBig = zip64.localOffset ?? rawLocalOffset;
    const disk = zip64.disk ?? rawDisk;
    if (disk !== 0) throw Error('备份 ZIP 不支持分卷');
    if (names.has(name)) throw Error('备份包含重复条目');
    names.add(name);
    if (method !== 0 && method !== 8) throw Error('备份 ZIP 使用了不支持的压缩方式');
    const allowedFlags = method === 8 ? 0x080e : 0x0808;
    if ((flags & ~allowedFlags) !== 0) throw Error('备份 ZIP 使用了不支持的加密或扩展方式');
    const localOffset = safeNumber(localOffsetBig, 'ZIP64 条目偏移超出浏览器可处理范围');
    const compressedNumber = safeNumber(compressed, 'ZIP64 附件超出浏览器可处理范围');
    const uncompressedNumber = safeNumber(uncompressed, 'ZIP64 附件超出浏览器可处理范围');
    if (localOffset >= start || compressedNumber > file.size || uncompressedNumber < 0) throw Error('备份 ZIP 条目范围无效');

    const local = await readSlice(file, localOffset, localOffset + 30);
    const localView = new DataView(local.buffer, local.byteOffset, local.byteLength);
    if (u32(localView, 0) !== 0x04034b50) throw Error('备份 ZIP 本地文件头无效');
    const localFlags = u16(localView, 6), localMethod = u16(localView, 8);
    const localCrc = u32(localView, 14), localCompressed = BigInt(u32(localView, 18)), localSize = BigInt(u32(localView, 22));
    const localNameLength = u16(localView, 26), localExtraLength = u16(localView, 28);
    if (localFlags !== flags || localMethod !== method || localNameLength !== nameLength) throw Error('备份 ZIP 文件头与目录不一致');
    const localVariable = await readSlice(file, localOffset + 30, localOffset + 30 + localNameLength + localExtraLength);
    const localNameBytes = localVariable.subarray(0, localNameLength);
    let localName: string;
    try { localName = (localFlags & 0x0800) ? utf8.decode(localNameBytes) : String.fromCharCode(...localNameBytes); }
    catch { throw Error('备份 ZIP 文件名无效'); }
    if (localName !== name) throw Error('备份 ZIP 文件头与目录不一致');
    const hasDescriptor = !!(flags & 8);
    const localSentinels = localCompressed === UINT32_MAX || localSize === UINT32_MAX;
    if (!hasDescriptor) {
      const localZip64 = parseZip64Extra(localVariable.subarray(localNameLength), {
        size: localSize === UINT32_MAX,
        compressedSize: localCompressed === UINT32_MAX,
        localOffset: false,
        disk: false
      });
      if ((localZip64.size ?? localSize) !== uncompressed || (localZip64.compressedSize ?? localCompressed) !== compressed || localCrc !== crc32) {
        throw Error('备份 ZIP 本地文件头与目录不一致');
      }
    }
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataOffset + compressedNumber;
    if (!Number.isSafeInteger(dataEnd) || dataEnd > start) throw Error('备份 ZIP 数据范围无效');
    let endOffset = dataEnd;
    if (hasDescriptor) {
      const descriptorStart = dataEnd;
      const descriptorHead = await readSlice(file, descriptorStart, Math.min(start, descriptorStart + 24));
      const descriptorView = new DataView(descriptorHead.buffer, descriptorHead.byteOffset, descriptorHead.byteLength);
      let descriptorOffset = u32(descriptorView, 0) === 0x08074b50 ? 4 : 0;
      const wide = compressed > UINT32_MAX || uncompressed > UINT32_MAX || localSentinels;
      const descriptorBytes = 4 + (wide ? 16 : 8);
      if (descriptorOffset + descriptorBytes > descriptorHead.length || u32(descriptorView, descriptorOffset) !== crc32) {
        throw Error('备份 ZIP 数据描述符无效');
      }
      descriptorOffset += 4;
      const descriptorCompressed = wide ? u64(descriptorView, descriptorOffset) : BigInt(u32(descriptorView, descriptorOffset));
      const descriptorSize = wide ? u64(descriptorView, descriptorOffset + 8) : BigInt(u32(descriptorView, descriptorOffset + 4));
      if (descriptorCompressed !== compressed || descriptorSize !== uncompressed) throw Error('备份 ZIP 数据描述符长度不符');
      endOffset += descriptorOffset + (wide ? 16 : 8);
    }
    entries.push({ name, method, flags, crc32, compressedSize: compressed, size: uncompressed,
      dataOffset, localOffset, endOffset });
    cursor = variableEnd;
  }
  if (cursor !== end) throw Error('备份 ZIP 中央目录长度不符');
  const ranges = [...entries].sort((left, right) => left.localOffset - right.localOffset);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index - 1].endOffset > ranges[index].localOffset) throw Error('备份 ZIP 条目相互重叠');
  }
  return entries;
}

function concat(chunks: Uint8Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  if (!Number.isSafeInteger(length)) throw Error('备份元数据超出浏览器可处理范围');
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

const crcTables = (() => {
  const tables = Array.from({ length: 8 }, () => new Uint32Array(256));
  for (let index = 0; index < tables[0].length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    tables[0][index] = value >>> 0;
  }
  for (let slice = 1; slice < tables.length; slice += 1) {
    for (let index = 0; index < tables[slice].length; index += 1) {
      const value = tables[slice - 1][index];
      tables[slice][index] = tables[0][value & 0xff] ^ (value >>> 8);
    }
  }
  return tables;
})();

function updateCrc32(crc: number, bytes: Uint8Array) {
  let value = crc;
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    const block = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
    const mixed = value ^ block;
    value = crcTables[7][mixed & 0xff] ^ crcTables[6][(mixed >>> 8) & 0xff] ^
      crcTables[5][(mixed >>> 16) & 0xff] ^ crcTables[4][(mixed >>> 24) & 0xff] ^
      crcTables[3][bytes[offset + 4]] ^ crcTables[2][bytes[offset + 5]] ^
      crcTables[1][bytes[offset + 6]] ^ crcTables[0][bytes[offset + 7]];
    offset += 8;
  }
  while (offset < bytes.length) {
    value = crcTables[0][(value ^ bytes[offset]) & 0xff] ^ (value >>> 8);
    offset += 1;
  }
  return value >>> 0;
}

export const backupArchiveStreamInternals = { updateCrc32 };

export async function streamBackupZipEntry(
  file: Blob,
  entry: BackupZipEntry,
  onChunk: (chunk: Uint8Array) => void | Promise<void>
) {
  let source = file.slice(entry.dataOffset, entry.dataOffset + safeNumber(entry.compressedSize, 'ZIP64 附件超出浏览器可处理范围')).stream();
  if (entry.method === 8) {
    if (typeof DecompressionStream === 'undefined') throw Error('此浏览器不支持流式 ZIP 解压，请升级浏览器后重试');
    try { source = source.pipeThrough(new DecompressionStream('deflate-raw')); }
    catch { throw Error('此浏览器不支持 ZIP Deflate 解压，请升级浏览器后重试'); }
  }
  const reader = source.getReader();
  let length = 0n, crc = 0xffff_ffff;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      length += BigInt(chunk.byteLength);
      if (length > entry.size) throw Error('备份附件解压长度超出目录声明');
      crc = updateCrc32(crc, chunk);
      await onChunk(chunk);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    if (error instanceof Error && /浏览器|备份附件/.test(error.message)) throw error;
    throw Error(`备份条目“${entry.name}”解压失败或数据已损坏`);
  } finally {
    reader.releaseLock();
  }
  if (length !== entry.size || ((crc ^ 0xffff_ffff) >>> 0) !== entry.crc32) throw Error(`备份条目“${entry.name}”长度或校验值不符`);
  return { size: length, crc32: (crc ^ 0xffff_ffff) >>> 0 };
}

export async function parseBackupFile<T>(
  file: Blob & { name?: string },
  validateVault: (value: unknown) => T,
  filename = file.name
): Promise<ParsedBackupFile<T>> {
  if (!String(filename || '').toLowerCase().endsWith('.zip')) {
    if (file.size > MAX_BACKUP_METADATA_BYTES) throw Error('备份元数据超过 64 MiB');
    const data = validateVault(JSON.parse(await file.text()));
    return { data, assets: [], entries: new Map(), file };
  }
  const central = await readCentralDirectory(file);
  const entryMap = new Map(central.map(entry => [entry.name, entry]));
  const vaultEntry = entryMap.get('vault.json'), manifestEntry = entryMap.get('assets.json');
  if (!vaultEntry || !manifestEntry) throw Error('备份结构不完整');
  assertBackupMetadataSize(vaultEntry.size);
  assertBackupMetadataSize(manifestEntry.size);
  const vaultChunks: Uint8Array[] = [], manifestChunks: Uint8Array[] = [];
  await streamBackupZipEntry(file, vaultEntry, chunk => { vaultChunks.push(chunk); });
  await streamBackupZipEntry(file, manifestEntry, chunk => { manifestChunks.push(chunk); });
  let data: T, manifest: unknown;
  try {
    data = validateVault(JSON.parse(utf8.decode(concat(vaultChunks))));
    manifest = JSON.parse(utf8.decode(concat(manifestChunks)));
  } catch (error) {
    if (error instanceof Error && error.message.includes('备份')) throw error;
    throw Error(`备份正文或附件清单无效：${(error as Error)?.message || '解析失败'}`);
  }
  if (!Array.isArray(manifest)) throw Error('附件清单无效');
  const assets: BackupAssetMetadata[] = [];
  const seenAssetIds = new Set<string>();
  if (manifest.length > MAX_ARCHIVE_ENTRIES - 2) throw Error('附件清单无效');
  const expectedNames = new Set(['vault.json', 'assets.json']);
  for (const value of manifest) {
    if (!value || typeof value !== 'object') throw Error('附件清单无效');
    const asset = value as Partial<BackupAssetMetadata>;
    if (typeof asset.id !== 'string' || !/^[a-f0-9-]{36}$/.test(asset.id) || typeof asset.name !== 'string' ||
      typeof asset.size !== 'number' || !Number.isSafeInteger(asset.size) || asset.size < 1 || seenAssetIds.has(asset.id)) {
      throw Error('附件清单无效');
    }
    seenAssetIds.add(asset.id);
    const entry = entryMap.get(`assets/${asset.id}`);
    if (!entry || entry.size !== BigInt(asset.size)) throw Error('备份附件缺失或长度不符');
    expectedNames.add(entry.name);
    assets.push(asset as BackupAssetMetadata);
  }
  if (expectedNames.size !== entryMap.size || [...entryMap.keys()].some(name => !expectedNames.has(name))) {
    throw Error('备份包含未声明的附件');
  }
  return { data, assets, entries: entryMap, file };
}

export function backupAssetEntry(parsed: ParsedBackupFile<unknown>, id: string) {
  const entry = parsed.entries.get(`assets/${id}`);
  if (!entry) throw Error('备份附件缺失');
  return entry;
}
