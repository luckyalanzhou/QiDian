const allowedHosts = new Set(['127.0.0.1', 'localhost']);

export function createPreviewRequestUrl(host, requestTarget, port) {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535 || typeof host !== 'string') return null;
  const [hostname] = host.split(':');
  if (!allowedHosts.has(hostname) || host !== `${hostname}:${port}`) return null;
  if (typeof requestTarget !== 'string' || (!requestTarget.startsWith('/') && requestTarget !== '*') || requestTarget.startsWith('//')) return null;

  try {
    const url = new URL(requestTarget, `http://${host}`);
    return url.origin === `http://${host}` ? url : null;
  } catch {
    return null;
  }
}
