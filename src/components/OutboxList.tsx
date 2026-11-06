import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { pitOpsDb } from '../db/dexieDb';
import { RefreshCw, CheckCircle2 } from 'lucide-react';

interface OutboxListProps {
  onForceSync: () => void;
  isSyncing: boolean;
}

export const OutboxList: React.FC<OutboxListProps> = ({ onForceSync, isSyncing }) => {
  const pendingItems = useLiveQuery(
    () => pitOpsDb.outbox.where('sync_status').equals('PENDING').toArray(),
    [],
    []
  );

  return (
    <div className="card">
      <div className="card-title">
        <span>Edge Outbox Queue (Dexie.js)</span>
        <button
          className="btn-secondary"
          style={{ color: 'var(--color-amber)', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={onForceSync}
          disabled={isSyncing}
        >
          <RefreshCw size={13} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? 'Syncing...' : 'Force Sync Now'}
        </button>
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
        P2H inspections recorded offline are persisted in client IndexedDB via <strong>Dexie.js</strong>.
        When connectivity resumes, they are automatically signed (HMAC), compressed (Gzip), and batch-uploaded.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 520, overflowY: 'auto' }}>
        {pendingItems.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 10px', fontSize: '0.85rem' }}>
            <CheckCircle2 size={32} style={{ color: 'var(--color-emerald)', margin: '0 auto 8px' }} />
            <div>Outbox empty. All offline inspections synchronized to central dispatch.</div>
          </div>
        ) : (
          pendingItems.map(item => (
            <div
              key={item.id}
              style={{
                background: '#0f172a',
                border: '1px solid var(--border-color)',
                borderRadius: 6,
                padding: 10,
                fontSize: '0.8rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                <span style={{ color: 'var(--color-amber)' }}>{item.unit_code}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-cyan)' }}>
                  {item.id.substring(0, 16)}...
                </span>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 4 }}>
                HM: {item.hour_meter} hrs | Shift: {item.shift} | {new Date(item.client_timestamp).toLocaleTimeString()}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: '#64748b', marginTop: 4, wordBreak: 'break-all' }}>
                HMAC: {item.hmac_signature.substring(0, 24)}...
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
