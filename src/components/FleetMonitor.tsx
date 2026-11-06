import React, { useState, useEffect } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';

interface FleetUnitData {
  unit_code: string;
  model: string;
  category: string;
  status: string;
  last_hour_meter: number;
  last_inspected_at?: string;
  current_pit_location: string;
}

interface FleetSummary {
  total_fleet: number;
  ready_count: number;
  grounded_count: number;
  warning_count: number;
  uninspected_count: number;
}

export const FleetMonitor: React.FC = () => {
  const [units, setUnits] = useState<FleetUnitData[]>([]);
  const [summary, setSummary] = useState<FleetSummary>({
    total_fleet: 0,
    ready_count: 0,
    grounded_count: 0,
    warning_count: 0,
    uninspected_count: 0
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchFleet();
  }, []);

  async function fetchFleet() {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/fleet/overview');
      if (res.ok) {
        const data = await res.json();
        setUnits(data.units || []);
        setSummary(data.summary || {});
      }
    } catch (err) {
      console.warn('Failed to fetch fleet overview:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetDemo() {
    if (!confirm('Reset fleet database to factory state?')) return;
    try {
      await fetch('/api/v1/dev/reset', { method: 'POST' });
      await fetchFleet();
    } catch (err) {
      console.error('Reset failed:', err);
    }
  }

  return (
    <div>
      {/* KPI Row */}
      <div className="kpi-row">
        <div className="kpi-card total">
          <div className="kpi-title">Total Active Fleet</div>
          <div className="kpi-value">{summary.total_fleet || 0}</div>
        </div>
        <div className="kpi-card ready">
          <div className="kpi-title">Ready for Dispatch</div>
          <div className="kpi-value" style={{ color: 'var(--color-emerald)' }}>
            {summary.ready_count || 0}
          </div>
        </div>
        <div className="kpi-card grounded">
          <div className="kpi-title">Grounded (Safety Hold)</div>
          <div className="kpi-value" style={{ color: 'var(--color-rose)' }}>
            {summary.grounded_count || 0}
          </div>
        </div>
        <div className="kpi-card warning">
          <div className="kpi-title">Maintenance Due</div>
          <div className="kpi-value" style={{ color: 'var(--color-amber)' }}>
            {summary.warning_count || 0}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <span>Live Heavy Fleet Dispatch Status</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" onClick={fetchFleet} disabled={loading}>
              <RefreshCw size={12} style={{ display: 'inline', marginRight: 4 }} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button className="btn-secondary" style={{ color: 'var(--color-rose)' }} onClick={handleResetDemo}>
              <Trash2 size={12} style={{ display: 'inline', marginRight: 4 }} />
              Reset Demo
            </button>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Unit Code</th>
                <th>Model / Capacity</th>
                <th>Status</th>
                <th>Hour Meter</th>
                <th>Current Location</th>
              </tr>
            </thead>
            <tbody>
              {units.map(u => {
                let badgeClass = 'badge-ready';
                let badgeLabel = 'READY';

                if (u.status === 'GROUNDED_SAFETY_HOLD') {
                  badgeClass = 'badge-grounded';
                  badgeLabel = 'GROUNDED (CRITICAL)';
                } else if (u.status === 'MAINTENANCE_DUE') {
                  badgeClass = 'badge-warning';
                  badgeLabel = 'MAINTENANCE DUE';
                } else if (u.status === 'UNINSPECTED') {
                  badgeClass = 'badge-uninspected';
                  badgeLabel = 'UNINSPECTED';
                }

                return (
                  <tr key={u.unit_code}>
                    <td style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{u.unit_code}</td>
                    <td>{u.model}</td>
                    <td>
                      <span className={`badge ${badgeClass}`}>{badgeLabel}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{u.last_hour_meter.toFixed(1)} hrs</td>
                    <td style={{ color: 'var(--text-muted)' }}>{u.current_pit_location}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
