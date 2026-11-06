import { getPendingOutbox, removeSyncedFromOutbox } from './idb.js';

const HMAC_SECRET = 'PITOPS_MINING_EDGE_SECRET_KEY_2026';

/**
 * Computes HMAC-SHA256 signature in browser via Web Crypto API
 */
export async function signRecordBrowser(record) {
  const canonicalString = [
    record.id,
    record.unit_code,
    record.shift,
    record.inspector_id,
    record.hour_meter,
    record.client_timestamp
  ].join('|');

  const encoder = new TextEncoder();
  const keyData = encoder.encode(HMAC_SECRET);
  const messageData = encoder.encode(canonicalString);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compresses string payload using browser native CompressionStream
 */
export async function compressGzip(text) {
  if (typeof CompressionStream === 'undefined') {
    return {
      buffer: new TextEncoder().encode(text),
      isCompressed: false
    };
  }

  const stream = new Blob([text]).stream();
  const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
  const response = new Response(compressedStream);
  const buffer = await response.arrayBuffer();

  return {
    buffer: new Uint8Array(buffer),
    isCompressed: true
  };
}

export class PitOpsSyncManager {
  constructor({ onSyncSuccess, onSyncError, onQueueChange }) {
    this.edgeDeviceId = this.getOrCreateDeviceId();
    this.onSyncSuccess = onSyncSuccess;
    this.onSyncError = onSyncError;
    this.onQueueChange = onQueueChange;
    this.isSyncing = false;
    this.networkMode = 'ONLINE'; // 'ONLINE' | 'OFFLINE' | 'INTERMITTENT'
    this.retryAttempt = 0;
    this.syncTimer = null;
  }

  getOrCreateDeviceId() {
    let id = localStorage.getItem('pitops_edge_device_id');
    if (!id) {
      id = 'TABLET-PIT-' + Math.floor(1000 + Math.random() * 9000);
      localStorage.setItem('pitops_edge_device_id', id);
    }
    return id;
  }

  setNetworkMode(mode) {
    this.networkMode = mode;
    console.log(`[PitOps Edge] Network mode switched to: ${mode}`);
    if (mode === 'ONLINE') {
      this.triggerSync();
    }
  }

  async triggerSync() {
    if (this.isSyncing) return;
    if (this.networkMode === 'OFFLINE') {
      console.log('[PitOps Edge] Sync paused: Device is in Deep Pit Blackspot (OFFLINE).');
      return;
    }

    // Intermittent simulation: 40% random packet drop
    if (this.networkMode === 'INTERMITTENT' && Math.random() < 0.4) {
      console.warn('[PitOps Edge] Sync simulated packet drop on lossy Wi-Fi link.');
      if (this.onSyncError) this.onSyncError(new Error('Simulated packet drop on lossy Wi-Fi mesh'));
      this.scheduleRetry();
      return;
    }

    try {
      this.isSyncing = true;
      const pendingItems = await getPendingOutbox();

      if (this.onQueueChange) {
        this.onQueueChange(pendingItems.length);
      }

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

      const headers = {
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
        body: buffer
      });

      if (!res.ok) {
        throw new Error(`Sync failed with HTTP ${res.status}`);
      }

      const responseData = await res.json();
      const ackIds = responseData.data.ackEventIds || [];

      // Remove acknowledged items from client outbox
      await removeSyncedFromOutbox(ackIds);

      const remaining = await getPendingOutbox();
      if (this.onQueueChange) {
        this.onQueueChange(remaining.length);
      }

      this.retryAttempt = 0;
      if (this.onSyncSuccess) {
        this.onSyncSuccess(responseData.data);
      }
    } catch (err) {
      console.error('[PitOps Edge] Sync error:', err);
      if (this.onSyncError) {
        this.onSyncError(err);
      }
      this.scheduleRetry();
    } finally {
      this.isSyncing = false;
    }
  }

  scheduleRetry() {
    this.retryAttempt++;
    // Exponential backoff capped at 30 seconds
    const delay = Math.min(1000 * Math.pow(1.5, this.retryAttempt), 30000);
    console.log(`[PitOps Edge] Auto-retry scheduled in ${Math.round(delay / 1000)}s (Attempt #${this.retryAttempt})`);

    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.triggerSync();
    }, delay);
  }
}
