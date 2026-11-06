import { db } from './db.js';

export const CRITICAL_SAFETY_ITEMS = [
  'service_brake',
  'steering_system',
  'emergency_stop',
  'fire_suppression_system',
  'operator_seatbelt',
  'fatigue_camera_fss'
];

/**
 * Evaluates an inspection against mining safety criteria and hour meter continuity
 */
export function evaluateInspection(unitCode, inspectionData) {
  const anomalies = [];
  const unitStmt = db.prepare('SELECT last_hour_meter, status FROM fleet_units WHERE unit_code = ?');
  const currentUnit = unitStmt.get(unitCode);

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
  let overallResult = 'PASS';
  let newFleetStatus = 'READY_FOR_DISPATCH';

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

/**
 * Updates the unit status in fleet_units table
 */
export function updateFleetUnitStatus(unitCode, status, hourMeter, inspectorId, timestamp) {
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

/**
 * Returns complete fleet telemetry and dispatch readiness overview
 */
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
  const units = unitsStmt.all();

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
