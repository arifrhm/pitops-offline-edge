import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { db } from './db.js';
import { evaluateInspection, updateFleetUnitStatus } from './fleetService.js';

export const HMAC_SECRET = process.env.PITOPS_HMAC_SECRET || 'PITOPS_MINING_EDGE_SECRET_KEY_2026';

/**
 * Computes canonical HMAC signature for an inspection record
 */
export function computeHMAC(record) {
  const canonicalString = [
    record.id,
    record.unit_code,
    record.shift,
    record.inspector_id,
    record.hour_meter,
    record.client_timestamp
  ].join('|');

  return crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(canonicalString)
    .digest('hex');
}

/**
 * Processes an incoming sync batch from an edge client
 */
export async function processSyncBatch({ batchId, edgeDeviceId, rawPayloadBuffer, isGzip, clientIp }) {
  let uncompressedBuffer;
  let compressedBytes = rawPayloadBuffer.length;

  if (isGzip) {
    uncompressedBuffer = zlib.gunzipSync(rawPayloadBuffer);
  } else {
    uncompressedBuffer = rawPayloadBuffer;
    compressedBytes = zlib.gzipSync(rawPayloadBuffer).length; // Simulated compression metrics
  }

  const uncompressedBytes = uncompressedBuffer.length;
  const compressionRatioPct = uncompressedBytes > 0
    ? Number(((1 - (compressedBytes / uncompressedBytes)) * 100).toFixed(1))
    : 0;

  const payloadText = uncompressedBuffer.toString('utf-8');
  const batchData = JSON.parse(payloadText);
  const records = Array.isArray(batchData.inspections) ? batchData.inspections : [];

  let insertedCount = 0;
  let deduplicatedCount = 0;
  const ackEventIds = [];
  const processedRecords = [];

  const checkIdempotencyStmt = db.prepare('SELECT event_id FROM idempotency_keys WHERE event_id = ?');
  const insertIdempotencyStmt = db.prepare('INSERT INTO idempotency_keys (event_id) VALUES (?)');

  const insertInspectionStmt = db.prepare(`
    INSERT INTO inspections (
      id, unit_code, shift, inspector_id, inspector_name, hour_meter, odometer_km,
      overall_result, critical_fault_count, non_critical_fault_count, checklist_json,
      notes, client_timestamp, edge_device_id, hmac_signature, anomaly_flags, sync_batch_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Transaction for batch atomicity
  db.exec('BEGIN TRANSACTION;');
  try {
    for (const record of records) {
      const eventId = record.id;

      // 1. Idempotency Check
      const existing = checkIdempotencyStmt.get(eventId);
      if (existing) {
        deduplicatedCount++;
        ackEventIds.push(eventId);
        continue;
      }

      // 2. Cryptographic Integrity Validation
      const expectedHmac = computeHMAC(record);
      const isSignatureValid = record.hmac_signature === expectedHmac;
      const signatureStatus = isSignatureValid ? 'VERIFIED' : 'UNVERIFIED_OR_MISMATCH';

      // 3. Safety & Hour Meter Evaluation
      const evaluation = evaluateInspection(record.unit_code, record);
      const anomalyFlags = [...evaluation.anomalies];

      if (!isSignatureValid) {
        anomalyFlags.push({
          code: 'HMAC_SIGNATURE_MISMATCH',
          message: 'Inspection payload signature does not match computed HMAC. Potential tampering.'
        });
      }

      // 4. Insert into database
      insertInspectionStmt.run(
        record.id,
        record.unit_code,
        record.shift || 'DAY',
        record.inspector_id,
        record.inspector_name || 'Pit Inspector',
        record.hour_meter,
        record.odometer_km || 0,
        evaluation.overallResult,
        evaluation.criticalFaults,
        evaluation.nonCriticalFaults,
        JSON.stringify(record.checklist || {}),
        record.notes || '',
        record.client_timestamp,
        edgeDeviceId,
        record.hmac_signature || expectedHmac,
        JSON.stringify(anomalyFlags),
        batchId
      );

      // 5. Update Fleet Unit Master Status
      updateFleetUnitStatus(
        record.unit_code,
        evaluation.newFleetStatus,
        record.hour_meter,
        record.inspector_id,
        record.client_timestamp
      );

      // 6. Record idempotency
      insertIdempotencyStmt.run(eventId);

      insertedCount++;
      ackEventIds.push(eventId);
      processedRecords.push({
        eventId,
        unitCode: record.unit_code,
        overallResult: evaluation.overallResult,
        status: evaluation.newFleetStatus,
        signatureStatus,
        anomalies: anomalyFlags
      });
    }

    // 7. Record Sync Audit Log
    const insertAuditStmt = db.prepare(`
      INSERT INTO sync_audit_log (
        batch_id, edge_device_id, compressed_bytes, uncompressed_bytes,
        compression_ratio_pct, records_received, records_inserted,
        records_deduplicated, client_ip
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertAuditStmt.run(
      batchId,
      edgeDeviceId,
      compressedBytes,
      uncompressedBytes,
      compressionRatioPct,
      records.length,
      insertedCount,
      deduplicatedCount,
      clientIp || '127.0.0.1'
    );

    db.exec('COMMIT;');
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }

  return {
    batchId,
    recordsReceived: records.length,
    recordsInserted: insertedCount,
    recordsDeduplicated: deduplicatedCount,
    compression: {
      compressedBytes,
      uncompressedBytes,
      compressionRatioPct: `${compressionRatioPct}%`
    },
    ackEventIds,
    processedRecords
  };
}

/**
 * Returns sync audit logs
 */
export function getSyncAuditLogs(limit = 20) {
  const stmt = db.prepare(`
    SELECT * FROM sync_audit_log
    ORDER BY id DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}

/**
 * Returns latest inspections
 */
export function getRecentInspections(limit = 25) {
  const stmt = db.prepare(`
    SELECT 
      i.*,
      f.model as unit_model
    FROM inspections i
    LEFT JOIN fleet_units f ON i.unit_code = f.unit_code
    ORDER BY i.client_timestamp DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}
