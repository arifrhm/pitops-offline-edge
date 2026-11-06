import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initDatabase, seedFleetIfEmpty, db, SEED_FLEET } from './db.js';
import { getFleetOverview } from './fleetService.js';
import { processSyncBatch, getSyncAuditLogs, getRecentInspections } from './syncService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3001;

// Initialize Database & Seed data
initDatabase();
seedFleetIfEmpty();

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'test' ? 'error' : 'info'
  }
});

await fastify.register(cors, {
  origin: true
});

// Configure custom raw content parser for gzip binary streaming
fastify.addContentTypeParser(
  ['application/gzip', 'application/octet-stream'],
  { parseAs: 'buffer' },
  (req, body, done) => {
    done(null, body);
  }
);

// Serve static build from dist (if built) or public directory
const distPath = path.join(__dirname, '..', 'dist');
const publicPath = path.join(__dirname, '..', 'public');
const staticRoot = fs.existsSync(distPath) ? distPath : publicPath;

await fastify.register(fastifyStatic, {
  root: staticRoot,
  prefix: '/'
});

// Health check
fastify.get('/api/v1/health', async () => {
  return {
    status: 'ONLINE',
    service: 'PitOps Fastify Industrial Edge Server',
    engine: 'Fastify v5 + SQLite WAL',
    timestamp: new Date().toISOString()
  };
});

// Fleet status overview
fastify.get('/api/v1/fleet/overview', async (req, reply) => {
  try {
    return getFleetOverview();
  } catch (err: any) {
    reply.status(500);
    return { error: err.message };
  }
});

// Recent inspections
fastify.get('/api/v1/inspections', async (req) => {
  const query = req.query as { limit?: string };
  const limit = Number(query?.limit) || 25;
  return getRecentInspections(limit);
});

// Sync Audit Logs
fastify.get('/api/v1/sync/audit-logs', async (req) => {
  const query = req.query as { limit?: string };
  const limit = Number(query?.limit) || 20;
  return getSyncAuditLogs(limit);
});

// Main Batch Sync Endpoint
fastify.post('/api/v1/sync/batch', async (req, reply) => {
  try {
    const isGzip = req.headers['content-encoding'] === 'gzip' ||
                   req.headers['content-type'] === 'application/gzip';

    const edgeDeviceId = (req.headers['x-edge-device-id'] as string) || 'EDGE-UNKNOWN';
    const batchId = (req.headers['x-batch-id'] as string) || `BATCH-${Date.now()}`;
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip;

    let rawPayloadBuffer: Buffer;
    if (Buffer.isBuffer(req.body)) {
      rawPayloadBuffer = req.body;
    } else if (typeof req.body === 'string') {
      rawPayloadBuffer = Buffer.from(req.body);
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

    return {
      success: true,
      data: result
    };
  } catch (err: any) {
    fastify.log.error(err);
    reply.status(400);
    return {
      success: false,
      error: err.message
    };
  }
});

// Reset database for presentation & demo replay
fastify.post('/api/v1/dev/reset', async (req, reply) => {
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
    return { message: 'Database reset to clean factory state successfully.' };
  } catch (err: any) {
    reply.status(500);
    return { error: err.message };
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`=======================================================`);
    console.log(`⚡  PitOps Fastify High-Performance Edge Server Running!`);
    console.log(`📡 Local Port: http://localhost:${PORT}`);
    console.log(`=======================================================`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
