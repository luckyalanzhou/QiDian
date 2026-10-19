export type DraftSlot = 'active' | 'ignored';

export type DraftRepository = {
  read: (owner?: string, slot?: DraftSlot) => Promise<unknown>;
  write: (value: unknown, owner?: string, slot?: DraftSlot) => Promise<unknown>;
  remove: (owner?: string, slot?: DraftSlot) => Promise<unknown>;
};

export type DraftRepositoryOptions = {
  indexedDB?: IDBFactory | null;
  databaseName: string;
  version?: number;
};

export function createDraftRepository({
  indexedDB = globalThis.indexedDB,
  databaseName,
  version = 2
}: DraftRepositoryOptions): DraftRepository {
  let databasePromise: Promise<IDBDatabase> | undefined;

  function openDatabase(): Promise<IDBDatabase> {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        if (!indexedDB || typeof indexedDB.open !== 'function') {
          reject(new Error('当前浏览器不支持本地草稿恢复'));
          return;
        }
        const request = indexedDB.open(databaseName, version);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains('drafts')) request.result.createObjectStore('drafts');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('无法打开本地草稿数据库'));
      });
    }
    return databasePromise;
  }

  function keyFor(owner: string, slot: DraftSlot): string {
    if (slot === 'ignored') return `ignored:${owner}`;
    return owner === 'local' || owner === 'legacy' ? 'vault' : `vault:${owner}`;
  }

  async function operate(method: 'get' | 'put' | 'delete', value: unknown, owner = 'local', slot: DraftSlot = 'active') {
    const database = await openDatabase();
    const key = keyFor(owner, slot);
    return new Promise<unknown>((resolve, reject) => {
      let transaction: IDBTransaction;
      let request: IDBRequest;
      try {
        transaction = database.transaction('drafts', method === 'get' ? 'readonly' : 'readwrite');
        const store = transaction.objectStore('drafts');
        request = method === 'get' ? store.get(key) : method === 'put' ? store.put(value, key) : store.delete(key);
      } catch (error) {
        reject(error);
        return;
      }
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error || new Error('本地草稿数据库操作失败'));
      transaction.onabort = () => reject(transaction.error || new Error('本地草稿数据库事务已中止'));
    });
  }

  return {
    read: (owner = 'local', slot: DraftSlot = 'active') => operate('get', undefined, owner, slot),
    write: (value, owner = 'local', slot: DraftSlot = 'active') => operate('put', value, owner, slot),
    remove: (owner = 'local', slot: DraftSlot = 'active') => operate('delete', undefined, owner, slot)
  };
}
