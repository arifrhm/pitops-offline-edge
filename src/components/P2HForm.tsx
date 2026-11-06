import React, { useState, useEffect } from 'react';
import { pitOpsDb, CachedFleetUnit } from '../db/dexieDb';
import { signRecordBrowser } from '../sync/crypto';
import { AlertTriangle, CheckCircle, Zap } from 'lucide-react';

export const CHECKLIST_DEFINITIONS = [
  { key: 'service_brake', label: 'Service Brake & Retarder System', critical: true },
  { key: 'steering_system', label: 'Primary & Emergency Steering', critical: true },
  { key: 'emergency_stop', label: 'Emergency Engine Shutdown Switch', critical: true },
  { key: 'fire_suppression_system', label: 'Ansul Fire Suppression System', critical: true },
  { key: 'operator_seatbelt', label: 'Operator 3-Point Safety Seatbelt', critical: true },
  { key: 'fatigue_camera_fss', label: 'Driver State / Fatigue Camera Sensor', critical: true },
  { key: 'engine_oil_coolant', label: 'Engine Oil & Coolant Levels', critical: false },
  { key: 'hydraulic_system', label: 'Hydraulic Hoses & Hoist Cylinders', critical: false },
  { key: 'tires_wheel_lugs', label: 'Tires (Pressure & Cuts) / Wheel Lugs', critical: false },
  { key: 'horn_reverse_alarm', label: 'Safety Horn & Automatic Reverse Alarm', critical: false }
];

interface P2HFormProps {
  deviceId: string;
  onSaved: () => void;
}

export const P2HForm: React.FC<P2HFormProps> = ({ deviceId, onSaved }) => {
  const [fleetList, setFleetList] = useState<CachedFleetUnit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<string>('');
  const [shift, setShift] = useState<'DAY' | 'NIGHT'>('DAY');
  const [inspectorId, setInspectorId] = useState<string>('OP-7742');
  const [hourMeter, setHourMeter] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [checklist, setChecklist] = useState<Record<string, 'PASS' | 'FAIL'>>(() => {
    const init: Record<string, 'PASS' | 'FAIL'> = {};
    CHECKLIST_DEFINITIONS.forEach(item => { init[item.key] = 'PASS'; });
    return init;
  });

  useEffect(() => {
    loadFleet();
  }, []);

  async function loadFleet() {
    try {
      const res = await fetch('/api/v1/fleet/overview');
      if (res.ok) {
        const data = await res.json();
        const units: CachedFleetUnit[] = data.units || [];
        setFleetList(units);
        await pitOpsDb.fleet_cache.bulkPut(units);
      }
    } catch {
      const cached = await pitOpsDb.fleet_cache.toArray();
      setFleetList(cached);
    }
  }

  const currentUnitInfo = fleetList.find(u => u.unit_code === selectedUnit);

  function handleUnitChange(code: string) {
    setSelectedUnit(code);
    const u = fleetList.find(x => x.unit_code === code);
    if (u) {
      setHourMeter((Number(u.last_hour_meter) + 8.5).toFixed(1));
    } else {
      setHourMeter('');
    }
  }

  function handleChecklistToggle(key: string, val: 'PASS' | 'FAIL') {
    setChecklist(prev => ({ ...prev, [key]: val }));
  }

  // Presets
  function applyPresetClean() {
    handleUnitChange('DT-793-01');
    const allPass: Record<string, 'PASS' | 'FAIL'> = {};
    CHECKLIST_DEFINITIONS.forEach(i => { allPass[i.key] = 'PASS'; });
    setChecklist(allPass);
    setNotes('Clean pre-start check. All hydraulic and brake interlocks verified.');
  }

  function applyPresetBrakeFail() {
    handleUnitChange('DT-793-02');
    const failBrake: Record<string, 'PASS' | 'FAIL'> = {};
    CHECKLIST_DEFINITIONS.forEach(i => { failBrake[i.key] = 'PASS'; });
    failBrake['service_brake'] = 'FAIL';
    setChecklist(failBrake);
    setNotes('CRITICAL HAZARD: Retarder dynamic brake cylinder leaking fluid on front axle.');
  }

  function applyPresetRollback() {
    handleUnitChange('DT-730-05');
    const allPass: Record<string, 'PASS' | 'FAIL'> = {};
    CHECKLIST_DEFINITIONS.forEach(i => { allPass[i.key] = 'PASS'; });
    setChecklist(allPass);
    setHourMeter('18000.0'); // Previous: 18452.0 (Rollback!)
    setNotes('Instrument display erratic. Testing rollback anomaly detector flag.');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUnit || !hourMeter) {
      alert('Please select heavy equipment and enter hour meter.');
      return;
    }

    const eventId = 'P2H-' + crypto.randomUUID();
    const clientTimestamp = new Date().toISOString();
    const numHour = parseFloat(hourMeter);

    const record = {
      id: eventId,
      unit_code: selectedUnit,
      shift,
      inspector_id: inspectorId,
      inspector_name: `Inspector ${inspectorId}`,
      hour_meter: numHour,
      odometer_km: 0,
      checklist,
      notes,
      client_timestamp: clientTimestamp,
      edge_device_id: deviceId
    };

    const signature = await signRecordBrowser(record);

    await pitOpsDb.outbox.put({
      ...record,
      hmac_signature: signature,
      sync_status: 'PENDING',
      created_at: new Date().toISOString()
    });

    onSaved();
  }

  return (
    <div className="card">
      <div className="card-title">
        <span>Pre-Start Safety Inspection (P2H)</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-cyan)', fontFamily: 'var(--font-mono)' }}>
          {deviceId}
        </span>
      </div>

      {/* Preset Test Scenarios */}
      <div className="form-group">
        <span className="form-label">Quick Scenario Presets (1-Click Test):</span>
        <div className="preset-scenarios">
          <button id="btn-preset-clean" type="button" className="btn-secondary" onClick={applyPresetClean}>
            <Zap size={13} style={{ display: 'inline', marginRight: 4, color: 'var(--color-emerald)' }} />
            Clean Pass (DT-793-01)
          </button>
          <button id="btn-preset-brake" type="button" className="btn-secondary" style={{ borderColor: 'var(--color-rose)' }} onClick={applyPresetBrakeFail}>
            <AlertTriangle size={13} style={{ display: 'inline', marginRight: 4, color: 'var(--color-rose)' }} />
            Critical Brake Fail (DT-793-02)
          </button>
          <button id="btn-preset-rollback" type="button" className="btn-secondary" style={{ borderColor: 'var(--color-amber)' }} onClick={applyPresetRollback}>
            <AlertTriangle size={13} style={{ display: 'inline', marginRight: 4, color: 'var(--color-amber)' }} />
            Rollback Anomaly (DT-730-05)
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Select Heavy Equipment</label>
            <select
              className="form-select"
              value={selectedUnit}
              onChange={e => handleUnitChange(e.target.value)}
              required
            >
              <option value="">-- Choose Equipment --</option>
              {fleetList.map(u => (
                <option key={u.unit_code} value={u.unit_code}>
                  {u.unit_code} - {u.model}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Operating Shift</label>
            <select className="form-select" value={shift} onChange={e => setShift(e.target.value as any)}>
              <option value="DAY">Day Shift (06:00 - 18:00)</option>
              <option value="NIGHT">Night Shift (18:00 - 06:00)</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Inspector ID</label>
            <input
              type="text"
              className="form-input"
              value={inspectorId}
              onChange={e => setInspectorId(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Hour Meter (SMU)</label>
            <input
              type="number"
              step="0.1"
              className="form-input"
              placeholder="e.g. 14219.0"
              value={hourMeter}
              onChange={e => setHourMeter(e.target.value)}
              required
            />
            {currentUnitInfo && (
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Recorded: {currentUnitInfo.last_hour_meter} hrs | Location: {currentUnitInfo.current_pit_location}
              </div>
            )}
          </div>
        </div>

        {/* 10-Point Checklist */}
        <div className="form-group">
          <label className="form-label">Mining Safety Checklist (10 Points)</label>
          <div className="checklist-grid">
            {CHECKLIST_DEFINITIONS.map(item => (
              <div key={item.key} className={`checklist-item ${item.critical ? 'critical' : ''}`}>
                <div className="item-info">
                  <span className="item-name">{item.label}</span>
                  {item.critical && <span className="item-crit-tag">Critical Safety Item</span>}
                </div>
                <div className="item-toggle-group">
                  <button
                    type="button"
                    className={`toggle-btn pass ${checklist[item.key] === 'PASS' ? 'active' : ''}`}
                    onClick={() => handleChecklistToggle(item.key, 'PASS')}
                  >
                    PASS
                  </button>
                  <button
                    type="button"
                    className={`toggle-btn fail ${checklist[item.key] === 'FAIL' ? 'active' : ''}`}
                    onClick={() => handleChecklistToggle(item.key, 'FAIL')}
                  >
                    FAIL
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Inspector Defect Notes</label>
          <textarea
            className="form-textarea"
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Record any oil weeping, abnormal vibration, or tire cuts..."
          />
        </div>

        <button id="btn-submit-p2h" type="submit" className="btn-primary">
          💾 Save P2H Inspection (Offline Ready)
        </button>
      </form>
    </div>
  );
};
