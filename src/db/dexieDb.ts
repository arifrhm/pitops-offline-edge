import Dexie, { type EntityTable } from 'dexie';

export interface OutboxInspection {
  id: string;
  unit_code: string;
  shift: string;
  inspector_id: string;
  inspector_name: string;
  hour_meter: number;
  odometer_km: number;
  checklist: Record<string, 'PASS' | 'FAIL'>;
  notes: string;
  client_timestamp: string;
  edge_device_id: string;
  hmac_signature: string;
  sync_status: 'PENDING' | 'SYNCED' | 'FAILED';
  created_at: string;
}

export interface CachedFleetUnit {
  unit_code: string;
  model: string;
  category: string;
  status: string;
  last_hour_meter: number;
  current_pit_location: string;
}

export class PitOpsDexie extends Dexie {
  outbox!: EntityTable<OutboxInspection, 'id'>;
  fleet_cache!: EntityTable<CachedFleetUnit, 'unit_code'>;

  constructor() {
    super('PitOpsEdgeDexie');
    this.version(1).stores({
      outbox: 'id, unit_code, client_timestamp, sync_status',
      fleet_cache: 'unit_code, status'
    });
  }
}

export const pitOpsDb = new PitOpsDexie();
