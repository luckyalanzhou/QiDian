import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBookmarkMetadataFetcher } from '../../server/adapters/bookmark-metadata-fetcher.mjs';

function harness(addresses = []) {
  const requests = [];
  const lookups = [];
  const fetchMetadata = createBookmarkMetadataFetcher({
    lookup: async hostname => { lookups.push(hostname); return addresses; },
    lookupIPv6: async () => [],
    request: async (url, options) => {
      requests.push({ url: url.href, ...options });
      return { statusCode: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: Buffer.from('<title>Example</title>') };
    }
  });
  return { fetchMetadata, requests, lookups };
}

function embedPref64(prefixLength, ipv4, prefixHex = '0064ff9b000000000000000000000000') {
  const prefix = Buffer.from(prefixHex, 'hex');
  const address = Buffer.alloc(16);
  prefix.copy(address, 0, 0, prefixLength / 8);
  const parts = ipv4.split('.').map(Number);
  const bytes = Buffer.from(parts);
  if (prefixLength === 96) bytes.copy(address, 12);
  else {
    const beforeU = 8 - prefixLength / 8;
    bytes.copy(address, prefixLength / 8, 0, beforeU);
    bytes.copy(address, 9, beforeU);
  }
  return Array.from({ length: 8 }, (_, index) => address.readUInt16BE(index * 2).toString(16)).join(':');
}

function pref64Fixture(prefixLength, prefixHex = '0064ff9b000000000000000000000000') {
  return [embedPref64(prefixLength, '192.0.0.170', prefixHex), embedPref64(prefixLength, '192.0.0.171', prefixHex)];
}

test('bookmark metadata fetch rejects unsupported schemes, credentials and local IP literals before connecting', async () => {
  const { fetchMetadata, requests } = harness([{ address: '93.184.216.34', family: 4 }]);
  for (const url of [
    'file:///etc/passwd',
    'https://user:secret@example.com/',
    'http://127.0.0.1/',
    'https://[::1]/'
  ]) await assert.rejects(fetchMetadata(url));
  assert.deepEqual(requests, []);
});

test('bookmark metadata fetch rejects private or special DNS answers before connecting', async () => {
  const privateAddresses = [
    ['127.0.0.1', 4], ['10.1.2.3', 4], ['100.64.0.1', 4], ['169.254.1.1', 4],
    ['172.20.1.1', 4], ['192.168.1.1', 4], ['224.0.0.1', 4], ['::', 6], ['::1', 6],
    ['fc00::1', 6], ['fe80::1', 6], ['2001:db8::1', 6], ['::ffff:127.0.0.1', 6]
  ];
  for (const [address, family] of privateAddresses) {
    const { fetchMetadata, requests } = harness([{ address, family }]);
    await assert.rejects(fetchMetadata('https://example.com/'), address);
    assert.deepEqual(requests, [], `must not connect to ${address}`);
  }
});

test('bookmark metadata fetch rejects a hostname if any DNS answer is not public', async () => {
  const { fetchMetadata, requests } = harness([
    { address: '93.184.216.34', family: 4 },
    { address: '192.168.1.10', family: 4 }
  ]);
  await assert.rejects(fetchMetadata('https://example.com/'));
  assert.deepEqual(requests, []);
});

test('bookmark metadata fetch accepts public IPv4 synthesized with every RFC 6052 Pref64 length and pins the IPv6 address', async () => {
  for (const prefixLength of [32, 40, 48, 56, 64, 96]) {
    const translated = embedPref64(prefixLength, '93.184.216.34');
    const requests = [];
    let pref64Lookups = 0;
    const fetchMetadata = createBookmarkMetadataFetcher({
      lookup: async () => [{ address: translated, family: 6 }],
      lookupIPv6: async hostname => {
        pref64Lookups++;
        assert.equal(hostname, 'ipv4only.arpa');
        return pref64Fixture(prefixLength);
      },
      request: async (url, options) => {
        requests.push({ url: url.href, address: options.address, family: options.family });
        return url.pathname === '/favicon.ico'
          ? { statusCode: 404, headers: {}, body: Buffer.alloc(0) }
          : { statusCode: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<title>Public through NAT64</title>') };
      }
    });

    const result = await fetchMetadata('https://example.com/');
    assert.equal(result.title, 'Public through NAT64', `prefix /${prefixLength}`);
    assert.equal(pref64Lookups, 1, `prefix /${prefixLength} is discovered once per fetch`);
    assert.equal(requests[0].address, translated, `prefix /${prefixLength} remains pinned`);
    assert.equal(requests[0].family, 6, `prefix /${prefixLength} uses IPv6 transport`);
  }
});

test('bookmark metadata fetch rejects a Pref64 address embedding a private IPv4 target', async () => {
  const networkPrefix = '20014860deadbeef0000000000000000';
  const privateTarget = embedPref64(56, '10.2.3.4', networkPrefix);
  const requests = [];
  const fetchMetadata = createBookmarkMetadataFetcher({
    lookup: async () => [{ address: privateTarget, family: 6 }],
    lookupIPv6: async () => pref64Fixture(56, networkPrefix),
    request: async (...args) => { requests.push(args); return { statusCode: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<title>must not connect</title>') }; }
  });

  await assert.rejects(fetchMetadata('https://example.com/'), /非公网地址/);
  assert.deepEqual(requests, []);
});

test('bookmark metadata fetch rejects scoped IPv6 answers even when Pref64 discovery succeeds', async () => {
  const requests = [];
  const fetchMetadata = createBookmarkMetadataFetcher({
    lookup: async () => [{ address: '2001:4860::1%eth0', family: 6 }],
    lookupIPv6: async () => pref64Fixture(56),
    request: async (...args) => { requests.push(args); return { statusCode: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<title>must not connect</title>') }; }
  });

  await assert.rejects(fetchMetadata('https://example.com/'), /非公网地址/);
  assert.deepEqual(requests, []);
});

test('bookmark metadata fetch uses a verified public IPv4 when Pref64 probing fails and refuses unclassified IPv6', async () => {
  const requests = [];
  let pref64Lookups = 0;
  const fetchMetadata = createBookmarkMetadataFetcher({
    lookup: async () => [
      { address: '64:ff9b::5db8:d822', family: 6 },
      { address: '93.184.216.34', family: 4 }
    ],
    lookupIPv6: async () => {
      pref64Lookups++;
      const error = Error('DNS resolver unavailable');
      error.code = 'ESERVFAIL';
      throw error;
    },
    request: async (url, options) => {
      requests.push({ url: url.href, address: options.address, family: options.family });
      return url.pathname === '/favicon.ico'
        ? { statusCode: 404, headers: {}, body: Buffer.alloc(0) }
        : { statusCode: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<title>IPv4 fallback</title>') };
    }
  });

  const result = await fetchMetadata('https://example.com/');
  assert.equal(result.title, 'IPv4 fallback');
  assert.equal(pref64Lookups, 1, 'page and favicon share one discovery attempt');
  assert.ok(requests.length >= 1);
  assert.ok(requests.every(request => request.address === '93.184.216.34' && request.family === 4));
});

test('bookmark metadata fetch bounds failed Pref64 discovery and still has time for verified IPv4', async () => {
  const requests = [];
  const fetchMetadata = createBookmarkMetadataFetcher({
    timeoutMs: 500,
    pref64TimeoutMs: 5,
    lookup: async () => [
      { address: '64:ff9b::5db8:d822', family: 6 },
      { address: '93.184.216.34', family: 4 }
    ],
    lookupIPv6: () => new Promise(() => {}),
    request: async (url, options) => {
      requests.push({ url: url.href, address: options.address, family: options.family });
      return url.pathname === '/favicon.ico'
        ? { statusCode: 404, headers: {}, body: Buffer.alloc(0) }
        : { statusCode: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<title>IPv4 fallback</title>') };
    }
  });

  const result = await fetchMetadata('https://example.com/');
  assert.equal(result.title, 'IPv4 fallback');
  assert.ok(requests.length >= 1);
  assert.ok(requests.every(request => request.address === '93.184.216.34' && request.family === 4));
});

test('bookmark metadata fetch accepts ordinary public IPv6 when ipv4only.arpa has no AAAA records', async () => {
  const requests = [];
  const fetchMetadata = createBookmarkMetadataFetcher({
    lookup: async () => [{ address: '2606:4700:4700::1111', family: 6 }],
    lookupIPv6: async hostname => {
      assert.equal(hostname, 'ipv4only.arpa');
      const error = Error('no AAAA records');
      error.code = 'ENODATA';
      throw error;
    },
    request: async (url, options) => {
      requests.push({ url: url.href, address: options.address, family: options.family });
      return url.pathname === '/favicon.ico'
        ? { statusCode: 404, headers: {}, body: Buffer.alloc(0) }
        : { statusCode: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<title>Native IPv6</title>') };
    }
  });

  const result = await fetchMetadata('https://example.com/');
  assert.equal(result.title, 'Native IPv6');
  assert.ok(requests.every(request => request.address === '2606:4700:4700::1111' && request.family === 6));
});

test('bookmark metadata fetch refuses IPv6-only access when Pref64 discovery cannot classify the answer', async () => {
  const requests = [];
  const error = Error('DNS resolver unavailable');
  error.code = 'ESERVFAIL';
  const fetchMetadata = createBookmarkMetadataFetcher({
    lookup: async () => [{ address: '2001:4860:4860::8888', family: 6 }],
    lookupIPv6: async () => { throw error; },
    request: async (...args) => { requests.push(args); return { statusCode: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<title>must not connect</title>') }; }
  });

  await assert.rejects(fetchMetadata('https://example.com/'), /非公网地址/);
  assert.deepEqual(requests, []);
});

test('bookmark metadata fetch pins requests to validated DNS addresses and returns plain-text page metadata', async () => {
  const requests = [];
  const fetchMetadata = createBookmarkMetadataFetcher({
    lookup: async hostname => {
      assert.equal(hostname, 'example.com');
      return [{ address: '93.184.216.34', family: 4 }];
    },
    request: async (url, options) => {
      requests.push({ url: url.href, address: options.address });
      if (url.pathname === '/favicon.png') return {
        statusCode: 200,
        headers: { 'content-type': 'image/png' },
        body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])
      };
      return {
        statusCode: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: Buffer.from('<title>Example &amp; Notes</title><meta name="description" content="A &lt;safe&gt; summary"><link rel="icon" href="/favicon.png">')
      };
    }
  });

  const result = await fetchMetadata('https://example.com/notes');
  assert.equal(result.title, 'Example & Notes');
  assert.equal(result.description, 'A <safe> summary');
  assert.equal(result.favicon.mime, 'image/png');
  assert.equal(result.favicon.bytes.length, 9);
  assert.deepEqual(requests, [
    { url: 'https://example.com/notes', address: '93.184.216.34' },
    { url: 'https://example.com/favicon.png', address: '93.184.216.34' }
  ]);
});

test('bookmark metadata fetch rechecks every redirect destination before connecting', async () => {
  const requests = [];
  const fetchMetadata = createBookmarkMetadataFetcher({
    lookup: async hostname => [{ address: hostname === 'private.example.com' ? '10.0.0.8' : '93.184.216.34', family: 4 }],
    request: async (url, options) => {
      requests.push({ url: url.href, address: options.address });
      return { statusCode: 302, headers: { location: 'http://private.example.com/secret' }, body: Buffer.alloc(0) };
    }
  });

  await assert.rejects(fetchMetadata('http://public.example.com/'));
  assert.deepEqual(requests, [{ url: 'http://public.example.com/', address: '93.184.216.34' }]);
});

test('bookmark metadata fetch rechecks Pref64 destinations on redirects before connecting', async () => {
  const networkPrefix = '20014860deadbeef0000000000000000';
  const requests = [];
  const fetchMetadata = createBookmarkMetadataFetcher({
    lookup: async hostname => [{
      address: embedPref64(56, hostname === 'private.example.com' ? '10.0.0.8' : '93.184.216.34', networkPrefix),
      family: 6
    }],
    lookupIPv6: async () => pref64Fixture(56, networkPrefix),
    request: async url => {
      requests.push(url.href);
      return { statusCode: 302, headers: { location: 'http://private.example.com/secret' }, body: Buffer.alloc(0) };
    }
  });

  await assert.rejects(fetchMetadata('http://public.example.com/'), /非公网地址/);
  assert.deepEqual(requests, ['http://public.example.com/']);
});

test('bookmark metadata fetch rejects custom ports and HTTPS downgrade redirects', async () => {
  const { fetchMetadata, requests } = harness([{ address: '93.184.216.34', family: 4 }]);
  await assert.rejects(fetchMetadata('https://example.com:8443/'));
  assert.deepEqual(requests, []);

  const downgrade = createBookmarkMetadataFetcher({
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    request: async () => ({ statusCode: 302, headers: { location: 'http://example.com/plain' }, body: Buffer.alloc(0) })
  });
  await assert.rejects(downgrade('https://example.com/'), /HTTPS 降级/);
});

test('bookmark metadata fetch enforces page size even when a transport returns an oversized body', async () => {
  const fetchMetadata = createBookmarkMetadataFetcher({
    maxPageBytes: 8,
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    request: async () => ({ statusCode: 200, headers: { 'content-type': 'text/html' }, body: Buffer.alloc(9) })
  });
  await assert.rejects(fetchMetadata('https://example.com/'), /过大/);
});

test('bookmark metadata fetch ignores unsafe SVG icons but keeps page text', async () => {
  const fetchMetadata = createBookmarkMetadataFetcher({
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    request: async url => url.pathname === '/icon.svg'
      ? { statusCode: 200, headers: { 'content-type': 'image/svg+xml' }, body: Buffer.from('<svg/>') }
      : { statusCode: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<title>Plain title</title><meta name="description" content="Plain summary"><link rel="icon" href="/icon.svg">') }
  });
  const result = await fetchMetadata('https://example.com/');
  assert.equal(result.title, 'Plain title');
  assert.equal(result.description, 'Plain summary');
  assert.equal(result.favicon, null);
});

test('bookmark metadata fetch bounds DNS lookup time and does not connect after timeout', async () => {
  const fetchMetadata = createBookmarkMetadataFetcher({
    timeoutMs: 5,
    lookup: () => new Promise(() => {}),
    request: async () => { assert.fail('timed out lookup must not connect'); }
  });
  await assert.rejects(fetchMetadata('https://example.com/'), /超时/);
});

test('bookmark metadata fetch caps redirect hops', async () => {
  const requests = [];
  const fetchMetadata = createBookmarkMetadataFetcher({
    maxRedirects: 1,
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    request: async url => {
      requests.push(url.href);
      return { statusCode: 302, headers: { location: `/redirect-${requests.length}` }, body: Buffer.alloc(0) };
    }
  });
  await assert.rejects(fetchMetadata('https://example.com/'), /重定向次数/);
  assert.equal(requests.length, 2);
});

test('bookmark metadata fetch falls back when document icon URLs are malformed', async () => {
  const requested = [];
  const fetchMetadata = createBookmarkMetadataFetcher({
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    request: async url => {
      requested.push(url.pathname);
      return url.pathname === '/favicon.ico'
        ? { statusCode: 404, headers: {}, body: Buffer.alloc(0) }
        : { statusCode: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<title>Readable</title><base href="http://[invalid"><link rel="icon" href="http://[invalid">') };
    }
  });
  const result = await fetchMetadata('https://example.com/');
  assert.equal(result.title, 'Readable');
  assert.deepEqual(requested, ['/', '/favicon.ico']);
});
