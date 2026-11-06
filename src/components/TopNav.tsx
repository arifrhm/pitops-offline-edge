import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { pitOpsDb } from '../db/dexieDb';
import { NetworkMode } from '../sync/syncManager';
import { ShieldCheck, Wifi, WifiOff, Activity } from 'lucide-react';

interface TopNavProps {
  networkMode: NetworkMode;
  onNetworkChange: (mode: NetworkMode) => void;
  deviceId: string;
}

export const TopNav: React.FC<TopNavProps> = ({ networkMode, onNetworkChange, deviceId }) => {
  // Reactive live count from Dexie.js
  const pendingCount = useLiveQuery(
    () => pitOpsDb.outbox.where('sync_status').equals('PENDING').count(),
    [],
    0
  );

  return (
    <header className="top-nav">
      <div className="brand">
        <div className="brand-icon">⛏️</div>
        <div>
          <div className="brand-title">PitOps Edge</div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
            Fastify & Dexie.js Offline Sync Engine
          </div>
        </div>
        <span className="brand-badge">
          <ShieldCheck size={12} style={{ display: 'inline', marginRight: 4 }} />
          Kepmen 1827 Compliant
        </span>
      </div>

      <div className="network-bar">
        <span className="network-label">Simulated Link:</span>
        <button
          id="btn-tower-online"
          className={`net-btn ${networkMode === 'ONLINE' ? 'active online' : ''}`}
          onClick={() => onNetworkChange('ONLINE')}
        >
          <Wifi size={13} style={{ display: 'inline', marginRight: 4 }} />
          Tower LTE (Online)
        </button>
        <button
          id="btn-pit-offline"
          className={`net-btn ${networkMode === 'OFFLINE' ? 'active offline' : ''}`}
          onClick={() => onNetworkChange('OFFLINE')}
        >
          <WifiOff size={13} style={{ display: 'inline', marginRight: 4 }} />
          Deep Pit (Offline)
        </button>
        <button
          id="btn-mesh-intermittent"
          className={`net-btn ${networkMode === 'INTERMITTENT' ? 'active intermittent' : ''}`}
          onClick={() => onNetworkChange('INTERMITTENT')}
        >
          <Activity size={13} style={{ display: 'inline', marginRight: 4 }} />
          Lossy Mesh (40% Drop)
        </button>

        <div className={`queue-pill ${pendingCount > 0 ? 'has-pending' : ''}`}>
          Outbox: {pendingCount} Pending
        </div>
      </div>
    </header>
  );
};
