import { pitOpsDb, OutboxInspection } from '../db/dexieDb';
import { compressGzip } from './compression';

export type NetworkMode = 'ONLINE' | 'OFFLINE' | 'INTERMITTENT';

export class PitOpsSyncManager {
  edgeDeviceId: string;
  networkMode: NetworkMode = 'ONLINE';
  isSyncing = false;
  retryAttempt = 0;
  syncTimer: any = null;
  onSyncComplete?: (result: any) => void;

  constructor(onSyncComplete?: (result: any) => void) {
    this.edgeDeviceId = this.getOrCreateDeviceId();
    this.onSyncComplete = onSyncComplete;
  }

  getOrCreateDeviceId(): string {
    let id = localStorage.getItem('pitops_edge_device_id');
    if (!id) {
      id = 'TABLET-PIT-' + Math.floor(1000 + Math.random() * 9000);
      localStorage.setItem('pitops_edge_device_id', id);
    }
    return id;
  }

  setNetworkMode(mode: NetworkMode) {
    this.networkMode = mode;
    console.log(`[PitOps Edge] Network mode switched to: ${mode}`);
    if (mode === 'ONLINE') {
      this.triggerSync();
    }
  }

  async triggerSync() {
    if (this.isSyncing) return;
    if (this.networkMode === 'OFFLINE') {
      console.log('[PitOps Edge] Deep Pit Blackspot: Sync suspended.');
      return;
    }

    // Simulate 40% lossy mesh packet drop
    if (this.networkMode === 'INTERMITTENT' && Math.random() < 0.4) {
      console.warn('[PitOps Edge] Simulated packet drop on lossy mesh.');
      this.scheduleRetry();
      return;
    }

    try {
      this.isSyncing = true;
      const pendingItems = await pitOpsDb.outbox
        .where('sync_status')
        .equals('PENDING')
        .toArray();

      if (pendingItems.length === 0) {
        this.isSyncing = false;
        return;
      }

      const batchId = `BATCH-${this.edgeDeviceId}-${Date.now()}`;
      const payloadObj = {
        batch_id: batchId,
        edge_device_id: this.edgeDeviceId,
        timestamp: new Date().toISOString(),
        inspections: pendingItems
      };

      const jsonText = JSON.stringify(payloadObj);
      const { buffer, isCompressed } = await compressGzip(jsonText);

      const headers: Record<string, string> = {
        'x-edge-device-id': this.edgeDeviceId,
        'x-batch-id': batchId
      };

      if (isCompressed) {
        headers['Content-Type'] = 'application/gzip';
        headers['Content-Encoding'] = 'gzip';
      } else {
        headers['Content-Type'] = 'application/json';
      }

      const res = await fetch('/api/v1/sync/batch', {
        method: 'POST',
        headers,
        body: buffer as unknown as BodyInit
      });

      if (!res.ok) {
        throw new Error(`Sync failed with HTTP ${res.status}`);
      }

      const responseData = await res.json();
      const ackIds: string[] = responseData.data.ackEventIds || [];

      // Bulk delete acknowledged items from Dexie Outbox
      await pitOpsDb.outbox.bulkDelete(ackIds);

      this.retryAttempt = 0;
      if (this.onSyncComplete) {
        this.onSyncComplete(responseData.data);
      }
    } catch (err) {
      console.error('[PitOps Edge] Sync batch failed:', err);
      this.scheduleRetry();
    } finally {
      this.isSyncing = false;
    }
  }

  scheduleRetry() {
    this.retryAttempt++;
    const delay = Math.min(1000 * Math.pow(1.5, this.retryAttempt), 30000);
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.triggerSync();
    }, delay);
  }
}
