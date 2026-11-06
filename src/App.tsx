import React, { useState, useEffect, useMemo } from 'react';
import { TopNav } from './components/TopNav';
import { P2HForm } from './components/P2HForm';
import { OutboxList } from './components/OutboxList';
import { FleetMonitor } from './components/FleetMonitor';
import { TelemetryStream } from './components/TelemetryStream';
import { PitOpsSyncManager, NetworkMode } from './sync/syncManager';
import { Tablet, Satellite, Layers } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inspector' | 'dispatch' | 'architecture'>('inspector');
  const [networkMode, setNetworkMode] = useState<NetworkMode>('ONLINE');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  const syncManager = useMemo(() => {
    return new PitOpsSyncManager(() => {
      setIsSyncing(false);
    });
  }, []);

  useEffect(() => {
    syncManager.setNetworkMode(networkMode);
  }, [networkMode, syncManager]);

  function handleForceSync() {
    setIsSyncing(true);
    syncManager.triggerSync();
  }

  return (
    <div>
      <TopNav
        networkMode={networkMode}
        onNetworkChange={setNetworkMode}
        deviceId={syncManager.edgeDeviceId}
      />

      <div className="container">
        {/* Navigation Tabs */}
        <nav className="tab-nav">
          <button
            className={`tab-btn ${activeTab === 'inspector' ? 'active' : ''}`}
            onClick={() => setActiveTab('inspector')}
          >
            <Tablet size={15} style={{ display: 'inline', marginRight: 6 }} />
            Pit Inspector Tablet (P2H Form)
          </button>
          <button
            className={`tab-btn ${activeTab === 'dispatch' ? 'active' : ''}`}
            onClick={() => setActiveTab('dispatch')}
          >
            <Satellite size={15} style={{ display: 'inline', marginRight: 6 }} />
            Central Dispatch & Telemetry Monitor
          </button>
          <button
            className={`tab-btn ${activeTab === 'architecture' ? 'active' : ''}`}
            onClick={() => setActiveTab('architecture')}
          >
            <Layers size={15} style={{ display: 'inline', marginRight: 6 }} />
            System Architecture & Mining Specs
          </button>
        </nav>

        {/* TAB 1: Inspector View */}
        {activeTab === 'inspector' && (
          <div className="two-col-grid">
            <P2HForm
              deviceId={syncManager.edgeDeviceId}
              onSaved={() => {
                if (networkMode === 'ONLINE') {
                  syncManager.triggerSync();
                }
              }}
            />
            <OutboxList
              onForceSync={handleForceSync}
              isSyncing={isSyncing}
            />
          </div>
        )}

        {/* TAB 2: Dispatch View */}
        {activeTab === 'dispatch' && (
          <div className="two-col-grid" style={{ gridTemplateColumns: '1.2fr 0.8fr' }}>
            <FleetMonitor />
            <TelemetryStream />
          </div>
        )}

        {/* TAB 3: Architecture View */}
        {activeTab === 'architecture' && (
          <div className="card">
            <div className="card-title">Production Engineering Stack: React + Dexie.js + Fastify + SQLite WAL</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, fontSize: '0.88rem', lineHeight: 1.6 }}>
              <div style={{ background: '#0f172a', padding: 16, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <h4 style={{ color: 'var(--color-amber)', marginBottom: 8 }}>1. Dexie.js (Reactive IndexedDB)</h4>
                <p style={{ color: 'var(--text-muted)' }}>
                  IndexedDB standard wrapper providing ACID transactions and reactive <code>useLiveQuery</code> hooks. When operators record P2H forms 300m underground, data is persisted locally in milliseconds without UI freezes.
                </p>
              </div>

              <div style={{ background: '#0f172a', padding: 16, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <h4 style={{ color: 'var(--color-cyan)', marginBottom: 8 }}>2. Fastify v5 Industrial Engine</h4>
                <p style={{ color: 'var(--text-muted)' }}>
                  Benchmarked at 3x the throughput of Express with native JSON schema validation. Processes high-volume compressed telemetry batches with sub-millisecond response latency.
                </p>
              </div>

              <div style={{ background: '#0f172a', padding: 16, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <h4 style={{ color: 'var(--color-emerald)', marginBottom: 8 }}>3. Cryptographic HMAC Chain</h4>
                <p style={{ color: 'var(--text-muted)' }}>
                  Web Crypto API calculates tamper-evident HMAC-SHA256 signatures client-side. Complies with Ministry of Energy and Mineral Resources (Kepmen ESDM 1827) technical safety audit requirements.
                </p>
              </div>

              <div style={{ background: '#0f172a', padding: 16, borderRadius: 8, border: '1px solid var(--border-color)' }}>
                <h4 style={{ color: 'var(--color-rose)', marginBottom: 8 }}>4. Hour Meter & Interlock Gate</h4>
                <p style={{ color: 'var(--text-muted)' }}>
                  Automated anomaly detection identifies instrument rollbacks. Critical brake or steering failures instantly lock the asset to <code>GROUNDED_SAFETY_HOLD</code>, blocking dispatch until workshop clearance.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
