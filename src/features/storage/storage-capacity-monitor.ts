import type { StorageCapacity } from '../../api/contracts';

const POLL_INTERVAL_MS = 60_000;

type StorageCapacityMonitorDependencies = {
  enabled: () => boolean;
  visible: () => boolean;
  read: (signal: AbortSignal) => Promise<StorageCapacity>;
  update: (capacity: StorageCapacity | null, stale: boolean) => void;
  setInterval: (callback: () => void, delay: number) => number;
  clearInterval: (timer: number) => void;
};

/** Polls the host data volume while its view is active, ignoring superseded responses. */
export function createStorageCapacityMonitor(dependencies: StorageCapacityMonitorDependencies) {
  let pollTimer: number | undefined;
  let requestController: AbortController | null = null;
  let requestRevision = 0;
  let lastCapacity: StorageCapacity | null = null;

  async function refresh() {
    if (!dependencies.enabled() || !dependencies.visible()) return;

    const revision = ++requestRevision;
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    try {
      const nextCapacity = await dependencies.read(controller.signal);
      if (revision === requestRevision && requestController === controller) {
        lastCapacity = nextCapacity;
        dependencies.update(nextCapacity, false);
      }
    } catch {
      if (revision === requestRevision && requestController === controller) dependencies.update(lastCapacity, true);
    } finally {
      if (requestController === controller) requestController = null;
    }
  }

  function stop() {
    requestRevision += 1;
    if (pollTimer !== undefined) dependencies.clearInterval(pollTimer);
    pollTimer = undefined;
    requestController?.abort();
    requestController = null;
    lastCapacity = null;
    dependencies.update(null, false);
  }

  function start() {
    stop();
    if (!dependencies.enabled()) return;
    void refresh();
    pollTimer = dependencies.setInterval(() => void refresh(), POLL_INTERVAL_MS);
  }

  return { refresh, start, stop };
}
