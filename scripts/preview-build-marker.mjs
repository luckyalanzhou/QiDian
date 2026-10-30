export function appendPreviewBuildMarker(serviceWorker, marker) {
  if (!/^[a-f0-9]{16}$/.test(marker)) throw new Error('Invalid local preview build marker');
  return Buffer.concat([Buffer.from(serviceWorker), Buffer.from(`\n// local-preview-build:${marker}\n`)]);
}
