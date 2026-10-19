export interface WorkspaceLifecycleOptions {
  document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  window: Pick<Window, 'setInterval' | 'clearInterval'>;
  isLocal: boolean;
  refreshCloud: () => unknown;
  pruneExpiredTrash: () => unknown;
  cloudRefreshIntervalMs?: number;
  trashPruneIntervalMs?: number;
}

export function mountWorkspaceLifecycle(options: WorkspaceLifecycleOptions) {
  const {
    document,
    window,
    isLocal,
    refreshCloud,
    pruneExpiredTrash,
    cloudRefreshIntervalMs = 2500,
    trashPruneIntervalMs = 60 * 60 * 1000
  } = options;

  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible') return;
    if (!isLocal) refreshCloud();
    pruneExpiredTrash();
  };

  const cloudTimer = isLocal ? undefined : window.setInterval(() => {
    if (document.visibilityState === 'visible') refreshCloud();
  }, cloudRefreshIntervalMs);
  const trashTimer = window.setInterval(pruneExpiredTrash, trashPruneIntervalMs);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    if (cloudTimer !== undefined) window.clearInterval(cloudTimer);
    window.clearInterval(trashTimer);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
