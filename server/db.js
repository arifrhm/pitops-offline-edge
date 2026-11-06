import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'pitops.db');

export const db = new DatabaseSync(DB_PATH);

// Initialize WAL mode for concurrent read-write performance
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fleet_units (
      unit_code TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'UNINSPECTED',
      last_hour_meter REAL DEFAULT 0,
      last_inspected_at TEXT,
      last_inspector_id TEXT,
      current_pit_location TEXT DEFAULT 'Ready Line Base',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inspections (
      id TEXT PRIMARY KEY,
      unit_code TEXT NOT NULL,
      shift TEXT NOT NULL,
      inspector_id TEXT NOT NULL,
      inspector_name TEXT NOT NULL,
      hour_meter REAL NOT NULL,
      odometer_km REAL DEFAULT 0,
      overall_result TEXT NOT NULL,
      critical_fault_count INTEGER DEFAULT 0,
      non_critical_fault_count INTEGER DEFAULT 0,
      checklist_json TEXT NOT NULL,
      notes TEXT,
      client_timestamp TEXT NOT NULL,
      synced_at TEXT DEFAULT (datetime('now')),
      edge_device_id TEXT NOT NULL,
      hmac_signature TEXT NOT NULL,
      anomaly_flags TEXT,
      sync_batch_id TEXT,
      FOREIGN KEY (unit_code) REFERENCES fleet_units(unit_code)
    );

    CREATE TABLE IF NOT EXISTS sync_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id TEXT NOT NULL,
      edge_device_id TEXT NOT NULL,
      compressed_bytes INTEGER NOT NULL,
      uncompressed_bytes INTEGER NOT NULL,
      compression_ratio_pct REAL NOT NULL,
      records_received INTEGER NOT NULL,
      records_inserted INTEGER NOT NULL,
      records_deduplicated INTEGER NOT NULL,
      client_ip TEXT,
      synced_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS idempotency_keys (
      event_id TEXT PRIMARY KEY,
      processed_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_inspections_unit ON inspections(unit_code);
    CREATE INDEX IF NOT EXISTS idx_inspections_client_ts ON inspections(client_timestamp);
    CREATE INDEX IF NOT EXISTS idx_audit_batch ON sync_audit_log(batch_id);
  `);
}

export const SEED_FLEET = [
  { unit_code: 'DT-793-01', model: 'Caterpillar 793F (240T Haul Truck)', category: 'HAUL_TRUCK', last_hour_meter: 14210.5, current_pit_location: 'Bench 12 - Pit Barat' },
  { unit_code: 'DT-793-02', model: 'Caterpillar 793F (240T Haul Truck)', category: 'HAUL_TRUCK', last_hour_meter: 15890.2, current_pit_location: 'Haul Road Ramp 4' },
  { unit_code: 'DT-730-05', model: 'Komatsu 730E-8 (190T Haul Truck)', category: 'HAUL_TRUCK', last_hour_meter: 18452.0, current_pit_location: 'Fuel Station 02' },
  { unit_code: 'DT-730-06', model: 'Komatsu 730E-8 (190T Haul Truck)', category: 'HAUL_TRUCK', last_hour_meter: 17120.8, current_pit_location: 'Bench 14 - Pit Barat' },
  { unit_code: 'EX-3600-01', model: 'Hitachi EX3600-6 Hydraulic Shovel', category: 'EXCAVATOR', last_hour_meter: 21340.0, current_pit_location: 'Loading Point Alpha' },
  { unit_code: 'EX-2000-02', model: 'Komatsu PC2000-8 Loading Shovel', category: 'EXCAVATOR', last_hour_meter: 19870.4, current_pit_location: 'Loading Point Bravo' },
  { unit_code: 'DZ-D375-01', model: 'Komatsu D375A-6 Heavy Track Dozer', category: 'DOZER', last_hour_meter: 12430.6, current_pit_location: 'Waste Dump Area 3' },
  { unit_code: 'GD-24M-01', model: 'Caterpillar 24M Motor Grader', category: 'GRADER', last_hour_meter: 9840.1, current_pit_location: 'Main Haul Road Spine' }
];

export function seedFleetIfEmpty() {
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM fleet_units');
  const result = countStmt.get();
  if (result.count === 0) {
    const insertStmt = db.prepare(`
      INSERT INTO fleet_units (unit_code, model, category, status, last_hour_meter, current_pit_location)
      VALUES (?, ?, ?, 'READY_FOR_DISPATCH', ?, ?)
    `);
    for (const unit of SEED_FLEET) {
      insertStmt.run(unit.unit_code, unit.model, unit.category, unit.last_hour_meter, unit.current_pit_location);
    }
  }
}
