import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { initDatabase, seedFleetIfEmpty, db } from '../server/db.js';
import { evaluateInspection } from '../server/fleetService.js';
import { computeHMAC, processSyncBatch } from '../server/syncService.js';

test('PitOps Offline Edge Sync Test Suite', async (t) => {
  initDatabase();
  seedFleetIfEmpty();

  await t.test('1. HMAC Signature Validation & Tamper Detection', () => {
    const record = {
      id: 'TEST-EVT-001',
      unit_code: 'DT-793-01',
      shift: 'DAY',
      inspector_id: 'OP-1234',
      hour_meter: 14220.0,
      client_timestamp: '2026-11-06T08:00:00.000Z'
    };

    const signature = computeHMAC(record);
    assert.ok(typeof signature === 'string');
    assert.equal(signature.length, 64); // SHA-256 hex string

    // Tampering test: modify hour meter
    const tamperedRecord = { ...record, hour_meter: 99999.0 };
    const tamperedSignature = computeHMAC(tamperedRecord);
    assert.notEqual(signature, tamperedSignature, 'HMAC must change when record is tampered');
  });

  await t.test('2. Safety Critical Item Evaluation & Interlock', () => {
    // Normal inspection
    const passInspection = {
      hour_meter: 14225.0,
      checklist: {
        service_brake: 'PASS',
        steering_system: 'PASS',
        emergency_stop: 'PASS'
      }
    };
    const evalPass = evaluateInspection('DT-793-01', passInspection);
    assert.equal(evalPass.overallResult, 'PASS');
    assert.equal(evalPass.newFleetStatus, 'READY_FOR_DISPATCH');

    // Critical failure: Service Brake failed
    const failInspection = {
      hour_meter: 14225.0,
      checklist: {
        service_brake: 'FAIL',
        steering_system: 'PASS'
      }
    };
    const evalFail = evaluateInspection('DT-793-01', failInspection);
    assert.equal(evalFail.overallResult, 'FAIL');
    assert.equal(evalFail.newFleetStatus, 'GROUNDED_SAFETY_HOLD');
    assert.equal(evalFail.criticalFaults, 1);
  });

  await t.test('3. Hour Meter Rollback Anomaly Flagging', () => {
    // Current DT-793-01 is at 14210.5
    const rollbackInspection = {
      hour_meter: 13000.0, // Rollback!
      checklist: { service_brake: 'PASS' }
    };
    const evalRollback = evaluateInspection('DT-793-01', rollbackInspection);
    const hasRollback = evalRollback.anomalies.some(a => a.code === 'HOUR_METER_ROLLBACK');
    assert.ok(hasRollback, 'Should detect hour meter rollback');
  });

  await t.test('4. Gzip Ingestion & Idempotency Deduplication', async () => {
    const testBatchId = 'BATCH-TEST-' + Date.now();
    const eventId = 'EVT-TEST-' + crypto.randomUUID();

    const record = {
      id: eventId,
      unit_code: 'DT-793-01',
      shift: 'DAY',
      inspector_id: 'OP-TEST',
      inspector_name: 'Test Inspector',
      hour_meter: 14230.0,
      checklist: { service_brake: 'PASS' },
      client_timestamp: new Date().toISOString()
    };
    record.hmac_signature = computeHMAC(record);

    const payload = JSON.stringify({
      batch_id: testBatchId,
      edge_device_id: 'TEST-DEVICE-01',
      inspections: [record]
    });

    const gzippedBuffer = zlib.gzipSync(Buffer.from(payload));

    // First ingestion (Should insert)
    const res1 = await processSyncBatch({
      batchId: testBatchId,
      edgeDeviceId: 'TEST-DEVICE-01',
      rawPayloadBuffer: gzippedBuffer,
      isGzip: true,
      clientIp: '127.0.0.1'
    });

    assert.equal(res1.recordsInserted, 1);
    assert.equal(res1.recordsDeduplicated, 0);

    // Second ingestion with identical eventId (Should deduplicate)
    const res2 = await processSyncBatch({
      batchId: testBatchId + '-RETRY',
      edgeDeviceId: 'TEST-DEVICE-01',
      rawPayloadBuffer: gzippedBuffer,
      isGzip: true,
      clientIp: '127.0.0.1'
    });

    assert.equal(res2.recordsInserted, 0, 'Must not duplicate insert on retry');
    assert.equal(res2.recordsDeduplicated, 1, 'Must recognize duplicate event ID');
    assert.ok(res2.ackEventIds.includes(eventId), 'Must acknowledge duplicate event ID to free client outbox');
  });
});
