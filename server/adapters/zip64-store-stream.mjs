const UINT32_MAX = 0xffff_ffffn;
const UTF8_FLAG = 0x0800;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const MAX_BYTES_BETWEEN_YIELDS = 4 * 1024 * 1024;

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

function set16(view, offset, value) { view.setUint16(offset, value, true); }
function set32(view, offset, value) { view.setUint32(offset, value, true); }
function set64(view, offset, value) { view.setBigUint64(offset, value, true); }

function crc32Update(crc, bytes) {
  let result = crc;
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    const block = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
    const mixed = result ^ block;
    result = crcTables[7][mixed & 0xff] ^ crcTables[6][(mixed >>> 8) & 0xff] ^
      crcTables[5][(mixed >>> 16) & 0xff] ^ crcTables[4][(mixed >>> 24) & 0xff] ^
      crcTables[3][bytes[offset + 4]] ^ crcTables[2][bytes[offset + 5]] ^
      crcTables[1][bytes[offset + 6]] ^ crcTables[0][bytes[offset + 7]];
    offset += 8;
  }
  while (offset < bytes.length) {
    result = crcTables[0][(result ^ bytes[offset]) & 0xff] ^ (result >>> 8);
    offset += 1;
  }
  return result >>> 0;
}

function zip64Extra(values) {
  const bytes = new Uint8Array(4 + values.length * 8);
  const view = new DataView(bytes.buffer);
  set16(view, 0, 1);
  set16(view, 2, values.length * 8);
  values.forEach((value, index) => set64(view, 4 + index * 8, value));
  return bytes;
}

function localHeader(name, size) {
  const nameBytes = new TextEncoder().encode(name);
  const large = size >= UINT32_MAX;
  const extra = large ? zip64Extra([0n, 0n]) : new Uint8Array();
  const header = new Uint8Array(30 + nameBytes.length + extra.length);
  const view = new DataView(header.buffer);
  set32(view, 0, 0x04034b50);
  set16(view, 4, large ? 45 : 20);
  set16(view, 6, UTF8_FLAG | DATA_DESCRIPTOR_FLAG);
  set16(view, 8, 0);
  set16(view, 10, 0);
  set16(view, 12, 0);
  set32(view, 14, 0);
  set32(view, 18, large ? 0xffff_ffff : 0);
  set32(view, 22, large ? 0xffff_ffff : 0);
  set16(view, 26, nameBytes.length);
  set16(view, 28, extra.length);
  header.set(nameBytes, 30);
  header.set(extra, 30 + nameBytes.length);
  return { bytes: header, nameBytes, large };
}

function dataDescriptor(crc, size) {
  const wide = size >= UINT32_MAX;
  const bytes = new Uint8Array(wide ? 24 : 16);
  const view = new DataView(bytes.buffer);
  set32(view, 0, 0x08074b50);
  set32(view, 4, crc);
  if (wide) {
    set64(view, 8, size);
    set64(view, 16, size);
  } else {
    set32(view, 8, Number(size));
    set32(view, 12, Number(size));
  }
  return bytes;
}

function centralHeader(entry) {
  const { nameBytes, size, crc, offset, large } = entry;
  const sizeLarge = size >= UINT32_MAX;
  const offsetLarge = offset >= UINT32_MAX;
  const values = [];
  if (sizeLarge) values.push(size, size);
  if (offsetLarge) values.push(offset);
  const extra = values.length ? zip64Extra(values) : new Uint8Array();
  const header = new Uint8Array(46 + nameBytes.length + extra.length);
  const view = new DataView(header.buffer);
  set32(view, 0, 0x02014b50);
  set16(view, 4, 0x031e);
  set16(view, 6, sizeLarge || offsetLarge ? 45 : 20);
  set16(view, 8, UTF8_FLAG | DATA_DESCRIPTOR_FLAG);
  set16(view, 10, 0);
  set16(view, 12, 0);
  set16(view, 14, 0);
  set32(view, 16, crc);
  set32(view, 20, sizeLarge ? 0xffff_ffff : Number(size));
  set32(view, 24, sizeLarge ? 0xffff_ffff : Number(size));
  set16(view, 28, nameBytes.length);
  set16(view, 30, extra.length);
  set16(view, 32, 0);
  set16(view, 34, 0);
  set16(view, 36, 0);
  set32(view, 38, 0o100644 << 16);
  set32(view, 42, offsetLarge ? 0xffff_ffff : Number(offset));
  header.set(nameBytes, 46);
  header.set(extra, 46 + nameBytes.length);
  return header;
}

function endRecords(count, centralSize, centralOffset) {
  const zip64 = count >= 0xffffn || centralSize >= UINT32_MAX || centralOffset >= UINT32_MAX;
  if (!zip64) {
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    set32(view, 0, 0x06054b50);
    set16(view, 4, 0);
    set16(view, 6, 0);
    set16(view, 8, Number(count));
    set16(view, 10, Number(count));
    set32(view, 12, Number(centralSize));
    set32(view, 16, Number(centralOffset));
    set16(view, 20, 0);
    return [end];
  }
  const zip64End = new Uint8Array(56);
  const zip64View = new DataView(zip64End.buffer);
  set32(zip64View, 0, 0x06064b50);
  set64(zip64View, 4, 44n);
  set16(zip64View, 12, 45);
  set16(zip64View, 14, 45);
  set32(zip64View, 16, 0);
  set32(zip64View, 20, 0);
  set64(zip64View, 24, count);
  set64(zip64View, 32, count);
  set64(zip64View, 40, centralSize);
  set64(zip64View, 48, centralOffset);
  const locator = new Uint8Array(20);
  const locatorView = new DataView(locator.buffer);
  set32(locatorView, 0, 0x07064b50);
  set32(locatorView, 4, 0);
  set64(locatorView, 8, centralOffset + centralSize);
  set32(locatorView, 16, 1);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  set32(endView, 0, 0x06054b50);
  set16(endView, 4, 0);
  set16(endView, 6, 0);
  set16(endView, 8, count >= 0xffffn ? 0xffff : Number(count));
  set16(endView, 10, count >= 0xffffn ? 0xffff : Number(count));
  set32(endView, 12, centralSize >= UINT32_MAX ? 0xffff_ffff : Number(centralSize));
  set32(endView, 16, centralOffset >= UINT32_MAX ? 0xffff_ffff : Number(centralOffset));
  set16(endView, 20, 0);
  return [zip64End, locator, end];
}

async function* archiveChunks(entries) {
  const central = [];
  let offset = 0n;
  for await (const entry of entries) {
    if (!entry || typeof entry.name !== 'string' || typeof entry.stream?.getReader !== 'function' ||
      !Number.isSafeInteger(entry.size) || entry.size < 0) throw new TypeError('Invalid ZIP64 entry');
    const size = BigInt(entry.size);
    const local = localHeader(entry.name, size);
    yield local.bytes;
    offset += BigInt(local.bytes.byteLength);
    let remaining = size, crc = 0xffff_ffff;
    let bytesSinceYield = 0;
    const reader = entry.stream.getReader();
    let sourceCompleted = false, cancelReason;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) { sourceCompleted = true; break; }
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
        if (!chunk.byteLength) continue;
        remaining -= BigInt(chunk.byteLength);
        if (remaining < 0n) throw new Error(`ZIP64 entry size exceeded: ${entry.name}`);
        crc = crc32Update(crc, chunk);
        offset += BigInt(chunk.byteLength);
        bytesSinceYield += chunk.byteLength;
        yield chunk;
        if (bytesSinceYield >= MAX_BYTES_BETWEEN_YIELDS) {
          bytesSinceYield = 0;
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    } catch (error) {
      cancelReason = error;
      throw error;
    } finally {
      if (!sourceCompleted) await reader.cancel(cancelReason).catch(() => {});
      reader.releaseLock();
    }
    if (remaining !== 0n) throw new Error(`ZIP64 entry size mismatch: ${entry.name}`);
    crc = (crc ^ 0xffff_ffff) >>> 0;
    const descriptor = dataDescriptor(crc, size);
    yield descriptor;
    offset += BigInt(descriptor.byteLength);
    central.push({ nameBytes: local.nameBytes, size, crc, offset: offset - BigInt(local.bytes.byteLength) - size - BigInt(descriptor.byteLength), large: local.large });
  }
  const centralOffset = offset;
  for (const entry of central) {
    const header = centralHeader(entry);
    yield header;
    offset += BigInt(header.byteLength);
  }
  const centralSize = offset - centralOffset;
  for (const record of endRecords(BigInt(central.length), centralSize, centralOffset)) yield record;
}

export function createZip64StoreStream(entries) {
  const iterator = archiveChunks(entries);
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await iterator.return?.(reason);
    }
  });
}

export const zip64StreamInternals = { centralHeader, crc32Update, dataDescriptor, endRecords, localHeader };
