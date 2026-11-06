import { db, FleetUnit } from './db.js';

export const CRITICAL_SAFETY_ITEMS = [
  'service_brake',
  'steering_system',
  'emergency_stop',
  'fire_suppression_system',
  'operator_seatbelt',
  'fatigue_camera_fss'
];

export interface AnomalyFlag {
  code: string;
  message: string;
}

export interface EvaluationResult {
  overallResult: 'PASS' | 'WARNING' | 'FAIL';
  newFleetStatus: 'READY_FOR_DISPATCH' | 'MAINTENANCE_DUE' | 'GROUNDED_SAFETY_HOLD';
  criticalFaults: number;
  nonCriticalFaults: number;
  anomalies: AnomalyFlag[];
}

export function evaluateInspection(unitCode: string, inspectionData: any): EvaluationResult {
  const anomalies: AnomalyFlag[] = [];
  const unitStmt = db.prepare('SELECT last_hour_meter, status FROM fleet_units WHERE unit_code = ?');
  const currentUnit = unitStmt.get(unitCode) as { last_hour_meter: number; status: string } | undefined;

  const prevHour = currentUnit ? currentUnit.last_hour_meter : 0;
  const newHour = Number(inspectionData.hour_meter);

  // 1. Hour Meter Continuity Validation
  if (currentUnit && prevHour > 0) {
    if (newHour < prevHour) {
      anomalies.push({
        code: 'HOUR_METER_ROLLBACK',
        message: `Submitted hour meter (${newHour}) is lower than recorded hour meter (${prevHour}). Potential tamper or instrument failure.`
      });
    } else if (newHour - prevHour > 24) {
      anomalies.push({
        code: 'HOUR_METER_UNREALISTIC_JUMP',
        message: `Submitted hour meter jumped by ${(newHour - prevHour).toFixed(1)} hrs in a single shift window.`
      });
    }
  }

  // 2. Critical Safety Fault Evaluation
  let criticalFaults = 0;
  let nonCriticalFaults = 0;
  const checklist = inspectionData.checklist || {};

  for (const [key, value] of Object.entries(checklist)) {
    const isCritical = CRITICAL_SAFETY_ITEMS.includes(key);
    if (value === 'FAIL') {
      if (isCritical) {
        criticalFaults++;
      } else {
        nonCriticalFaults++;
      }
    }
  }

  // 3. Determine Unit Operational Status
  let overallResult: 'PASS' | 'WARNING' | 'FAIL' = 'PASS';
  let newFleetStatus: 'READY_FOR_DISPATCH' | 'MAINTENANCE_DUE' | 'GROUNDED_SAFETY_HOLD' = 'READY_FOR_DISPATCH';

  if (criticalFaults > 0) {
    overallResult = 'FAIL';
    newFleetStatus = 'GROUNDED_SAFETY_HOLD';
  } else if (nonCriticalFaults > 0) {
    overallResult = 'WARNING';
    newFleetStatus = 'MAINTENANCE_DUE';
  }

  return {
    overallResult,
    newFleetStatus,
    criticalFaults,
    nonCriticalFaults,
    anomalies
  };
}

export function updateFleetUnitStatus(
  unitCode: string,
  status: string,
  hourMeter: number,
  inspectorId: string,
  timestamp: string
) {
  const updateStmt = db.prepare(`
    UPDATE fleet_units
    SET status = ?,
        last_hour_meter = MAX(last_hour_meter, ?),
        last_inspected_at = ?,
        last_inspector_id = ?,
        updated_at = datetime('now')
    WHERE unit_code = ?
  `);
  updateStmt.run(status, hourMeter, timestamp, inspectorId, unitCode);
}

export function getFleetOverview() {
  const unitsStmt = db.prepare(`
    SELECT 
      unit_code,
      model,
      category,
      status,
      last_hour_meter,
      last_inspected_at,
      last_inspector_id,
      current_pit_location
    FROM fleet_units
    ORDER BY unit_code ASC
  `);
  const units = unitsStmt.all() as unknown as FleetUnit[];

  const statsStmt = db.prepare(`
    SELECT
      COUNT(*) as total_fleet,
      SUM(CASE WHEN status = 'READY_FOR_DISPATCH' THEN 1 ELSE 0 END) as ready_count,
      SUM(CASE WHEN status = 'GROUNDED_SAFETY_HOLD' THEN 1 ELSE 0 END) as grounded_count,
      SUM(CASE WHEN status = 'MAINTENANCE_DUE' THEN 1 ELSE 0 END) as warning_count,
      SUM(CASE WHEN status = 'UNINSPECTED' THEN 1 ELSE 0 END) as uninspected_count
    FROM fleet_units
  `);
  const stats = statsStmt.get();

  return {
    summary: stats,
    units
  };
}
