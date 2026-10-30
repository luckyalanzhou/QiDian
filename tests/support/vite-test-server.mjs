import { createServer } from 'vite';

export function createViteTestServer(options) {
  return createServer({
    ...options,
    server: { hmr: false, ws: false, ...options.server },
    optimizeDeps: { ...options.optimizeDeps, noDiscovery: true }
  });
}
