import React, { useState, useEffect } from 'react';
import { ShieldCheck, HardDriveDownload } from 'lucide-react';

interface AuditLogEntry {
  id: number;
  batch_id: string;
  edge_device_id: string;
  compressed_bytes: number;
  uncompressed_bytes: number;
  compression_ratio_pct: number;
  records_received: number;
  records_inserted: number;
  records_deduplicated: number;
  client_ip: string;
  synced_at: string;
}

export const TelemetryStream: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);

  useEffect(() => {
    fetchLogs();
    const timer = setInterval(fetchLogs, 5000);
    return () => clearInterval(timer);
  }, []);

  async function fetchLogs() {
    try {
      const res = await fetch('/api/v1/sync/audit-logs?limit=15');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch {
      // offline or server restarting
    }
  }

  return (
    <div className="card">
      <div className="card-title">
        <span>Sync Bandwidth & Cryptographic Audit Stream</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--color-cyan)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <HardDriveDownload size={12} />
          Fastify Streaming Ingestion
        </span>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 10 }}>
        Real-time telemetry auditing client Gzip wire compression savings and HMAC-SHA256 signatures for ESDM compliance.
      </p>

      <div className="telemetry-stream">
        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
            No sync batches ingested yet.
          </div>
        ) : (
          logs.map(log => (
            <div key={log.id} className="stream-entry">
              <div className="stream-header">
                <span>{log.batch_id}</span>
                <span style={{ color: 'var(--color-emerald)', fontWeight: 700 }}>
                  -{log.compression_ratio_pct}% Bandwidth Saved
                </span>
              </div>
              <div className="stream-meta">
                Device: {log.edge_device_id} | Raw: {log.uncompressed_bytes}B → Gzip: {log.compressed_bytes}B | Records: {log.records_inserted} inserted, {log.records_deduplicated} dedup
              </div>
              <div style={{ fontSize: '0.68rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                <ShieldCheck size={11} style={{ color: 'var(--color-emerald)' }} />
                Synced: {log.synced_at} | HMAC Audit Verified
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
