import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_CHUNK_BYTES } from '../../server/repositories/asset-repository.js';
import { ASSET_PRUNE_BATCH_SIZE, ASSET_PRUNE_GRACE_MS, ASSET_UPLOAD_TTL_MS, createAssetService } from '../../server/application/asset-service.js';

const referenced = '11111111-1111-4111-8111-111111111111';
const historical = '22222222-2222-4222-8222-222222222222';
const orphan = '33333333-3333-4333-8333-333333333333';

function byteStream(bytes) {
  return new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } });
}

test('asset service stores streamed chunks and reads them back without assembling the file', async () => {
  const calls = [], chunks = new Map();
  const repository = {
    deleteExpiredAccountAssetUploads: async (_db, accountId, cutoff) => calls.push(['expire', accountId, cutoff]),
    listAccountAssets: async (_db, accountId) => ({ results: [{ id:referenced, accountId }] }),
    beginAccountAssetUpload: async (_db, upload) => calls.push(['begin', upload]),
    appendAccountAssetUploadChunks: async (_db, accountId, id, incoming) => {
      calls.push(['append', accountId, id, incoming.map(({ ordinal, bytes }) => [ordinal, bytes.length])]);
      for (const { ordinal, bytes } of incoming) chunks.set(ordinal, bytes);
    },
    finalizeAccountAssetUpload: async (_db, metadata) => calls.push(['finalize', metadata]),
    deleteAccountAssetUpload: async (_db, accountId, id) => calls.push(['delete-upload', accountId, id]),
    findAccountAsset: async (_db, accountId, id) => ({ id, accountId, name:'pixel.png', mime:'image/png', size:4 }),
    getAccountAssetChunk: async (_db, _accountId, _id, ordinal) => ({ data:chunks.get(ordinal) })
  };
  const service = createAssetService(repository, { now:() => 765, createId:() => referenced });
  const bytes = new Uint8Array([0x89,0x50,0x4e,0x47]);

  assert.deepEqual(await service.list({}, 'account-a'), [{ id:referenced, accountId:'account-a' }]);
  assert.deepEqual(await service.create({}, 'account-a', 'pixel.png', byteStream(bytes)), {
    id:referenced, name:'pixel.png', mime:'image/png', size:4, created:765
  });
  const read = await service.read({}, 'account-a', referenced);
  assert.equal(read.size, 4);
  assert.deepEqual(new Uint8Array(await new Response(read.stream).arrayBuffer()), bytes);
  assert.deepEqual(calls.slice(0, 3), [
    ['expire', 'account-a', 765 - 24 * 60 * 60 * 1000],
    ['expire', 'account-a', 765 - 24 * 60 * 60 * 1000],
    ['begin', { accountId:'account-a', id:referenced, name:'pixel.png', created:765 }]
  ]);
  assert.deepEqual(calls[3], ['append','account-a',referenced,[[0,4]]]);
  assert.deepEqual(calls[4], ['finalize',{ accountId:'account-a', id:referenced, name:'pixel.png', mime:'image/png', size:4, created:765 }]);
});

test('expired upload cleanup sweeps dormant accounts and reports removed staging data', async () => {
  const calls = [];
  const service = createAssetService({
    listAssetAccountIds: async () => ({ results: [{ accountId:'account-a' }, { accountId:'account-b' }] }),
    findExpiredAccountAssetImportScopes: async (_db, accountId, cutoff) => {
      calls.push(['scopes', accountId, cutoff]);
      return { results: accountId === 'account-a' ? [{ id:'scope-a' }] : [] };
    },
    abortAccountAssetImportScope: async (_db, scope) => {
      calls.push(['abort-scope', scope.accountId, scope.id, scope.olderThan]);
      return [{ meta:{ changes:1 } }, { meta:{ changes:1 } }, { meta:{ changes:2 } }];
    },
    deleteExpiredAccountAssetUploads: async (_db, accountId, cutoff) => {
      calls.push(['uploads', accountId, cutoff]);
      return { meta:{ changes:accountId === 'account-a' ? 3 : 1 } };
    },
    findOrphanedAccountAssetCandidates: async () => ({ results:[] })
  }, { now:() => 9 * ASSET_UPLOAD_TTL_MS });

  assert.deepEqual(await service.cleanupExpiredUploads({}), {
    accountsScanned:2, importScopesExpired:1, importAssetsRemoved:2, uploadsRemoved:4,
    assetsRemoved:0, assetBytesRemoved:0
  });
  const cutoff = 8 * ASSET_UPLOAD_TTL_MS;
  assert.deepEqual(calls, [
    ['scopes','account-a',cutoff],
    ['abort-scope','account-a','scope-a',cutoff],
    ['uploads','account-a',cutoff],
    ['scopes','account-b',cutoff],
    ['uploads','account-b',cutoff]
  ]);
});

test('expired upload cleanup continues across accounts and reports failures', async () => {
  const cleaned = [];
  const service = createAssetService({
    listAssetAccountIds: async () => ({ results:[{ accountId:'account-a' },{ accountId:'account-b' }] }),
    findExpiredAccountAssetImportScopes: async (_db, accountId) => {
      if (accountId === 'account-a') throw new Error('database busy');
      return { results:[] };
    },
    abortAccountAssetImportScope: async () => [],
    deleteExpiredAccountAssetUploads: async (_db, accountId) => { cleaned.push(accountId); return { meta:{ changes:1 } }; },
    findOrphanedAccountAssetCandidates: async () => ({ results:[] })
  });

  await assert.rejects(service.cleanupExpiredUploads({}), error => {
    assert.ok(error instanceof AggregateError);
    assert.match(error.message, /1 account/);
    return true;
  });
  assert.deepEqual(cleaned,['account-b']);
});

test('asset service recognizes a fetched ICO favicon for inline same-origin display', async () => {
  let savedMime = '';
  const service = createAssetService({
    deleteExpiredAccountAssetUploads: async () => {},
    beginAccountAssetUpload: async () => {},
    appendAccountAssetUploadChunks: async () => {},
    finalizeAccountAssetUpload: async (_db, value) => { savedMime = value.mime; },
    deleteAccountAssetUpload: async () => {}
  }, { createId: () => referenced });
  const bytes = new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16]);
  const uploaded = await service.create({}, 'account-a', 'bookmark-favicon.ico', byteStream(bytes));
  assert.equal(uploaded.mime, 'image/x-icon');
  assert.equal(savedMime, 'image/x-icon');
});

test('asset upload uses a fixed memory buffer while accepting a file larger than 8 MiB', async () => {
  const data = new Uint8Array(8 * 1024 * 1024 + 1).fill(37);
  let maxBatchBytes = 0, uploadedBytes = 0, finalized;
  const service = createAssetService({
    deleteExpiredAccountAssetUploads: async () => {},
    beginAccountAssetUpload: async () => {},
    appendAccountAssetUploadChunks: async (_db, _accountId, _id, chunks) => {
      const bytes = chunks.reduce((sum, chunk) => sum + chunk.bytes.length, 0);
      maxBatchBytes = Math.max(maxBatchBytes, bytes);
      uploadedBytes += bytes;
    },
    finalizeAccountAssetUpload: async (_db, asset) => { finalized = asset; },
    deleteAccountAssetUpload: async () => {}
  }, { now:() => 20, createId:() => referenced });

  const asset = await service.create({}, 'account-a', 'large.bin', new ReadableStream({
    start(controller) {
      for (let offset=0; offset<data.length; offset+=64*1024) controller.enqueue(data.subarray(offset, offset+64*1024));
      controller.close();
    }
  }));
  assert.equal(asset.size,data.length);
  assert.equal(uploadedBytes,data.length);
  assert.ok(maxBatchBytes <= 16 * ASSET_CHUNK_BYTES,'database write batches stay bounded independently of total file size');
  assert.equal(finalized.size,data.length);
});

test('failed or empty uploads are removed from staging', async () => {
  const deleted=[];
  const service=createAssetService({
    deleteExpiredAccountAssetUploads:async()=>{},
    beginAccountAssetUpload:async()=>{},
    appendAccountAssetUploadChunks:async()=>{throw Error('disk full')},
    finalizeAccountAssetUpload:async()=>{},
    deleteAccountAssetUpload:async(_db,accountId,id)=>deleted.push([accountId,id])
  },{createId:()=>referenced});
  await assert.rejects(service.create({},'account-a','a.bin',byteStream(new Uint8Array([1]))),/disk full/);
  await assert.rejects(service.create({},'account-a','empty.bin',byteStream(new Uint8Array())),error=>error.status===400);
  assert.deepEqual(deleted,[['account-a',referenced],['account-a',referenced]]);
});

test('asset pruning scans references once and deletes only old unreferenced assets at the scanned revision', async () => {
  let deletion, candidateQuery;
  const now = ASSET_PRUNE_GRACE_MS * 10;
  const revisionReads = [{ revision:5 }, { revision:5 }];
  const pageCalls = [];
  const oldReferenced = '44444444-4444-4444-8444-444444444444';
  const service = createAssetService({
    findAccountAssetPruneRevision: async () => revisionReads.shift(),
    listAccountAssetReferencePage: async (_db, _accountId, source, afterId, limit) => {
      pageCalls.push([source, afterId, limit]);
      const references = {
        notes:[{ id:'n1', data:`<img src="/api/assets/${referenced}">` }],
        bookmarks:[{ id:'b1', data:`{"icon":"/api/assets/${historical}?download=1"}` }],
        trash:[{ id:'t1', data:`/api/assets/${oldReferenced}` }],
        snapshots:[{ id:'4', data:`{"body":"/api/assets/${oldReferenced}"}` }]
      };
      return { results:references[source] };
    },
    findExpiredAccountAssetCandidates: async (_db, accountId, cutoff, afterId, limit) => {
      candidateQuery = { accountId, cutoff, afterId, limit };
      return { results:afterId ? [] : [
        { id:referenced, size:10, created:now - ASSET_PRUNE_GRACE_MS - 1 },
        { id:historical, size:20, created:now - ASSET_PRUNE_GRACE_MS - 1 },
        { id:oldReferenced, size:25, created:now - ASSET_PRUNE_GRACE_MS - 1 },
        { id:orphan, size:30, created:now - ASSET_PRUNE_GRACE_MS - 1 }
      ] };
    },
    deleteAccountAssets: async (_db, accountId, ids, cutoff, expectedRevision) => {
      deletion = { accountId, ids, cutoff, expectedRevision };
      return [orphan];
    }
  }, { now:() => now });

  assert.deepEqual(await service.prune({}, 'account-a'), { removed:1, bytes:30 });
  assert.deepEqual(deletion,{ accountId:'account-a', ids:[orphan], cutoff:now - ASSET_PRUNE_GRACE_MS, expectedRevision:5 });
  assert.deepEqual(candidateQuery,{ accountId:'account-a', cutoff:now - ASSET_PRUNE_GRACE_MS,
    afterId:orphan, limit:ASSET_PRUNE_BATCH_SIZE });
  assert.deepEqual(pageCalls.map(([source]) => source), ['notes','bookmarks','trash','snapshots']);
});

test('asset pruning skips a reference scan when the vault changes during paging', async () => {
  const now = ASSET_PRUNE_GRACE_MS * 10;
  let reads = 0, candidateReads = 0, deletions = 0;
  const service = createAssetService({
    findAccountAssetPruneRevision: async () => ({ revision:++reads === 1 ? 5 : 6 }),
    listAccountAssetReferencePage: async () => ({ results:[] }),
    findExpiredAccountAssetCandidates: async () => {
      candidateReads += 1;
      return { results:candidateReads === 1 ? [{ id:orphan, size:30, created:now - ASSET_PRUNE_GRACE_MS - 1 }] : [] };
    },
    deleteAccountAssets: async () => { deletions += 1; return []; }
  }, { now:() => now });

  assert.deepEqual(await service.prune({}, 'account-a'), { removed:0, bytes:0 });
  assert.equal(candidateReads, 1, 'the first page confirms cleanup work exists before scanning references');
  assert.equal(deletions, 0);
});

test('scheduled cleanup pages candidates in bounded batches after one reference scan', async () => {
  const now = ASSET_PRUNE_GRACE_MS * 10;
  const assets = Array.from({ length:ASSET_PRUNE_BATCH_SIZE + 1 }, (_, index) => ({
    id:`${String(index + 1).padStart(3, '0')}-asset`, size:index + 2, created:now - ASSET_PRUNE_GRACE_MS
  }));
  const queries = [], deletions = [];
  const service = createAssetService({
    listAssetAccountIds: async () => ({ results:[{ accountId:'account-a' }] }),
    findExpiredAccountAssetImportScopes: async () => ({ results:[] }),
    abortAccountAssetImportScope: async () => [],
    deleteExpiredAccountAssetUploads: async () => ({ meta:{ changes:0 } }),
    findAccountAssetPruneRevision: async () => ({ revision:12 }),
    listAccountAssetReferencePage: async () => ({ results:[] }),
    findExpiredAccountAssetCandidates: async (_db, accountId, cutoff, afterId, limit) => {
      queries.push({ accountId, cutoff, afterId, limit });
      return { results:assets.filter(asset => asset.id > afterId).slice(0, limit) };
    },
    deleteAccountAssets: async (_db, accountId, ids, cutoff, expectedRevision) => {
      deletions.push({ accountId, ids, cutoff, expectedRevision });
      return ids;
    }
  }, { now:() => now });

  assert.deepEqual(await service.cleanupExpiredUploads({}), {
    accountsScanned:1, importScopesExpired:0, importAssetsRemoved:0, uploadsRemoved:0,
    assetsRemoved:assets.length, assetBytesRemoved:assets.reduce((sum, asset) => sum + asset.size, 0)
  });
  assert.deepEqual(queries.map(query => [query.afterId, query.limit]), [
    ['', ASSET_PRUNE_BATCH_SIZE], [assets[ASSET_PRUNE_BATCH_SIZE - 1].id, ASSET_PRUNE_BATCH_SIZE],
    [assets.at(-1).id, ASSET_PRUNE_BATCH_SIZE]
  ]);
  assert.deepEqual(deletions.map(batch => batch.ids.length), [ASSET_PRUNE_BATCH_SIZE, 1]);
  assert.ok(deletions.every(batch => batch.expectedRevision === 12));
});

test('asset read rejects missing metadata and incomplete chunks', async () => {
  const service=createAssetService({
    deleteExpiredAccountAssetUploads:async()=>{},
    findAccountAsset:async(_db,_accountId,id)=>id===referenced?{id,name:'a.bin',mime:'application/octet-stream',size:1}:null,
    getAccountAssetChunk:async()=>({data:new Uint8Array([1,2])})
  });
  await assert.rejects(service.read({},'account-a',orphan),error=>error.status===404);
  const corrupt=await service.read({},'account-a',referenced);
  await assert.rejects(new Response(corrupt.stream).arrayBuffer(),error=>error.status===500&&/不完整/.test(error.message));
});
