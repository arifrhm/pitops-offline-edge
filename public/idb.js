// IndexedDB Wrapper for PitOps Edge Client

const DB_NAME = 'PitOpsEdgeDB';
const DB_VERSION = 1;

export function openPitOpsDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Outbox Store: Holds inspections created offline waiting to sync
      if (!db.objectStoreNames.contains('outbox')) {
        const outboxStore = db.createObjectStore('outbox', { keyPath: 'id' });
        outboxStore.createIndex('client_timestamp', 'client_timestamp', { unique: false });
        outboxStore.createIndex('sync_status', 'sync_status', { unique: false });
      }

      // 2. Cached Fleet Master: Allows offline lookup of trucks & previous hour meters
      if (!db.objectStoreNames.contains('fleet_cache')) {
        db.createObjectStore('fleet_cache', { keyPath: 'unit_code' });
      }

      // 3. Local Audit Log
      if (!db.objectStoreNames.contains('local_logs')) {
        db.createObjectStore('local_logs', { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveToOutbox(inspection) {
  const db = await openPitOpsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    const record = {
      ...inspection,
      sync_status: 'PENDING',
      created_at: new Date().toISOString()
    };
    const req = store.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingOutbox() {
  const db = await openPitOpsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readonly');
    const store = tx.objectStore('outbox');
    const req = store.getAll();
    req.onsuccess = () => {
      const pending = req.result.filter(item => item.sync_status === 'PENDING');
      resolve(pending);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function removeSyncedFromOutbox(ackIds) {
  const db = await openPitOpsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    let completed = 0;
    if (ackIds.length === 0) return resolve();

    for (const id of ackIds) {
      const req = store.delete(id);
      req.onsuccess = () => {
        completed++;
        if (completed === ackIds.length) resolve();
      };
      req.onerror = () => reject(req.error);
    }
  });
}

export async function cacheFleetUnits(units) {
  const db = await openPitOpsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('fleet_cache', 'readwrite');
    const store = tx.objectStore('fleet_cache');
    for (const unit of units) {
      store.put(unit);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedFleet() {
  const db = await openPitOpsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('fleet_cache', 'readonly');
    const store = tx.objectStore('fleet_cache');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
