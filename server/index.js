import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase, seedFleetIfEmpty, db, SEED_FLEET } from './db.js';
import { getFleetOverview } from './fleetService.js';
import { processSyncBatch, getSyncAuditLogs, getRecentInspections } from './syncService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

const app = express();

// Initialize Database & Seed data
initDatabase();
seedFleetIfEmpty();

// Raw body parser for handling gzipped binary payloads as well as standard JSON
app.use('/api/v1/sync/batch', express.raw({ type: ['application/gzip', 'application/octet-stream', 'application/json'], limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// Static frontend files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'PitOps Offline-First Sync Server',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Fleet status overview
app.get('/api/v1/fleet/overview', (req, res) => {
  try {
    const data = getFleetOverview();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recent inspections
app.get('/api/v1/inspections', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 25;
    const records = getRecentInspections(limit);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync Audit Logs (Compression & Ingestion stats)
app.get('/api/v1/sync/audit-logs', (req, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const logs = getSyncAuditLogs(limit);
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Main Batch Sync Endpoint
app.post('/api/v1/sync/batch', async (req, res) => {
  try {
    const isGzip = req.headers['content-encoding'] === 'gzip' || req.headers['content-type'] === 'application/gzip';
    const edgeDeviceId = req.headers['x-edge-device-id'] || 'EDGE-UNKNOWN';
    const batchId = req.headers['x-batch-id'] || `BATCH-${Date.now()}`;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    let rawPayloadBuffer;
    if (Buffer.isBuffer(req.body)) {
      rawPayloadBuffer = req.body;
    } else {
      rawPayloadBuffer = Buffer.from(JSON.stringify(req.body));
    }

    const result = await processSyncBatch({
      batchId,
      edgeDeviceId,
      rawPayloadBuffer,
      isGzip,
      clientIp
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (err) {
    console.error('Sync batch error:', err);
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

// Reset database route for presentation & live demo replay
app.post('/api/v1/dev/reset', (req, res) => {
  try {
    db.exec(`
      DELETE FROM inspections;
      DELETE FROM sync_audit_log;
      DELETE FROM idempotency_keys;
      DELETE FROM fleet_units;
    `);
    const insertStmt = db.prepare(`
      INSERT INTO fleet_units (unit_code, model, category, status, last_hour_meter, current_pit_location)
      VALUES (?, ?, ?, 'READY_FOR_DISPATCH', ?, ?)
    `);
    for (const unit of SEED_FLEET) {
      insertStmt.run(unit.unit_code, unit.model, unit.category, unit.last_hour_meter, unit.current_pit_location);
    }
    res.json({ message: 'Database reset to clean factory state successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`⛏️  PitOps Offline-First Mining Edge Server Running!`);
  console.log(`📡 Local Port: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
