import { openPitOpsDB, saveToOutbox, getPendingOutbox, cacheFleetUnits, getCachedFleet } from './idb.js';
import { PitOpsSyncManager, signRecordBrowser } from './syncClient.js';

// Checklist items definition
const CHECKLIST_ITEMS = [
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

let cachedFleetList = [];
let syncManager;

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  await openPitOpsDB();

  // Initialize Sync Manager
  syncManager = new PitOpsSyncManager({
    onSyncSuccess: (data) => {
      renderOutbox();
      loadFleetOverview();
      loadSyncAuditLogs();
      showNotification(`Batch ${data.batchId} synced! (${data.recordsInserted} inserted, ${data.compression.compressionRatioPct} bandwidth saved)`);
    },
    onSyncError: (err) => {
      console.warn('Sync failed, items remain safely in IndexedDB outbox:', err.message);
      renderOutbox();
    },
    onQueueChange: (count) => {
      updateQueuePill(count);
    }
  });

  document.getElementById('activeDeviceId').textContent = `Device: ${syncManager.edgeDeviceId}`;

  setupTabs();
  setupNetworkSwitcher();
  setupChecklist();
  setupPresets();
  setupForm();
  setupDashboardControls();

  await loadFleetUnits();
  await renderOutbox();
  await loadFleetOverview();
  await loadSyncAuditLogs();

  // Auto-sync polling every 10 seconds if online
  setInterval(() => {
    if (syncManager.networkMode === 'ONLINE') {
      syncManager.triggerSync();
    }
  }, 10000);
});

// Setup Tab Navigation
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');

      if (targetId === 'tab-dispatch') {
        loadFleetOverview();
        loadSyncAuditLogs();
      }
    });
  });
}

// Setup Network Switcher
function setupNetworkSwitcher() {
  const btnOnline = document.getElementById('netOnlineBtn');
  const btnOffline = document.getElementById('netOfflineBtn');
  const btnIntermittent = document.getElementById('netIntermittentBtn');

  function setMode(mode, activeBtn) {
    [btnOnline, btnOffline, btnIntermittent].forEach(b => b.classList.remove('active'));
    activeBtn.classList.add('active');
    syncManager.setNetworkMode(mode);
  }

  btnOnline.addEventListener('click', () => setMode('ONLINE', btnOnline));
  btnOffline.addEventListener('click', () => setMode('OFFLINE', btnOffline));
  btnIntermittent.addEventListener('click', () => setMode('INTERMITTENT', btnIntermittent));
}

// Populate 10-point checklist in form
function setupChecklist() {
  const container = document.getElementById('checklistContainer');
  container.innerHTML = '';

  CHECKLIST_ITEMS.forEach(item => {
    const row = document.createElement('div');
    row.className = `checklist-item ${item.critical ? 'critical' : ''}`;
    row.innerHTML = `
      <div class="item-info">
        <span class="item-name">${item.label}</span>
        ${item.critical ? '<span class="item-crit-tag">Critical Safety Item</span>' : ''}
      </div>
      <div class="item-toggle-group" data-item="${item.key}">
        <button type="button" class="toggle-btn pass active" data-val="PASS">PASS</button>
        <button type="button" class="toggle-btn fail" data-val="FAIL">FAIL</button>
      </div>
    `;

    const passBtn = row.querySelector('.pass');
    const failBtn = row.querySelector('.fail');

    passBtn.addEventListener('click', () => {
      passBtn.classList.add('active');
      failBtn.classList.remove('active');
    });

    failBtn.addEventListener('click', () => {
      failBtn.classList.add('active');
      passBtn.classList.remove('active');
    });

    container.appendChild(row);
  });
}

// Fetch Fleet units (with offline cache fallback)
async function loadFleetUnits() {
  const select = document.getElementById('unitSelect');
  try {
    const res = await fetch('/api/v1/fleet/overview');
    if (res.ok) {
      const data = await res.json();
      cachedFleetList = data.units || [];
      await cacheFleetUnits(cachedFleetList);
    }
  } catch (err) {
    console.warn('Network offline: loading fleet units from IndexedDB cache...');
    cachedFleetList = await getCachedFleet();
  }

  select.innerHTML = '<option value="">-- Choose Equipment --</option>';
  cachedFleetList.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.unit_code;
    opt.textContent = `${u.unit_code} - ${u.model}`;
    select.appendChild(opt);
  });

  select.addEventListener('change', () => {
    const selected = cachedFleetList.find(u => u.unit_code === select.value);
    const notice = document.getElementById('prevHourNotice');
    const hourInput = document.getElementById('hourMeterInput');
    if (selected) {
      notice.textContent = `Recorded Hour Meter: ${selected.last_hour_meter} hrs | Location: ${selected.current_pit_location}`;
      hourInput.value = (Number(selected.last_hour_meter) + 8.5).toFixed(1);
    } else {
      notice.textContent = '';
      hourInput.value = '';
    }
  });
}

// Setup Presets for quick testing
function setupPresets() {
  const select = document.getElementById('unitSelect');
  const hourInput = document.getElementById('hourMeterInput');
  const notes = document.getElementById('notesInput');

  function setChecklistAll(val) {
    document.querySelectorAll('.item-toggle-group').forEach(group => {
      const pass = group.querySelector('.pass');
      const fail = group.querySelector('.fail');
      if (val === 'PASS') {
        pass.classList.add('active');
        fail.classList.remove('active');
      } else {
        pass.classList.remove('active');
        fail.classList.add('active');
      }
    });
  }

  // Preset 1: Clean Pass (DT-793-01)
  document.getElementById('presetCleanPass').addEventListener('click', () => {
    select.value = 'DT-793-01';
    select.dispatchEvent(new Event('change'));
    setChecklistAll('PASS');
    notes.value = 'All pre-start checks verified. Ready for hauling operations.';
  });

  // Preset 2: Critical Brake Fail (DT-793-02)
  document.getElementById('presetCriticalBrake').addEventListener('click', () => {
    select.value = 'DT-793-02';
    select.dispatchEvent(new Event('change'));
    setChecklistAll('PASS');

    // Fail service brake
    const brakeGroup = document.querySelector('[data-item="service_brake"]');
    if (brakeGroup) {
      brakeGroup.querySelector('.pass').classList.remove('active');
      brakeGroup.querySelector('.fail').classList.add('active');
    }
    notes.value = 'CRITICAL DEFECT: Service brake pedal pressure drops under retarder load. Immediate workshop hold required.';
  });

  // Preset 3: Hour Meter Rollback Anomaly (DT-730-05)
  document.getElementById('presetRollback').addEventListener('click', () => {
    select.value = 'DT-730-05';
    select.dispatchEvent(new Event('change'));
    setChecklistAll('PASS');

    // Set rollback hours (18452 -> 18000)
    hourInput.value = '18000.0';
    notes.value = 'Hour meter cluster display erratic. Testing rollback anomaly detection flag.';
  });
}

// Setup Form Submission
function setupForm() {
  const form = document.getElementById('p2hForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const unitCode = document.getElementById('unitSelect').value;
    const shift = document.getElementById('shiftSelect').value;
    const inspectorId = document.getElementById('inspectorIdInput').value;
    const hourMeter = Number(document.getElementById('hourMeterInput').value);
    const notes = document.getElementById('notesInput').value;

    if (!unitCode || isNaN(hourMeter)) {
      alert('Please select heavy equipment and valid hour meter.');
      return;
    }

    const checklist = {};
    document.querySelectorAll('.item-toggle-group').forEach(group => {
      const itemKey = group.getAttribute('data-item');
      const isFail = group.querySelector('.fail').classList.contains('active');
      checklist[itemKey] = isFail ? 'FAIL' : 'PASS';
    });

    const eventId = 'P2H-' + crypto.randomUUID();
    const clientTimestamp = new Date().toISOString();

    const record = {
      id: eventId,
      unit_code: unitCode,
      shift,
      inspector_id: inspectorId,
      inspector_name: `Inspector ${inspectorId}`,
      hour_meter: hourMeter,
      odometer_km: 0,
      checklist,
      notes,
      client_timestamp: clientTimestamp,
      edge_device_id: syncManager.edgeDeviceId
    };

    // Digitally sign record locally using HMAC-SHA256
    record.hmac_signature = await signRecordBrowser(record);

    // Save to IndexedDB outbox
    await saveToOutbox(record);
    await renderOutbox();

    showNotification(`Saved P2H for ${unitCode} to local IndexedDB.`);

    // Trigger auto-sync (if online)
    syncManager.triggerSync();
  });
}

// Render Outbox items in UI
async function renderOutbox() {
  const list = document.getElementById('outboxList');
  const pending = await getPendingOutbox();
  updateQueuePill(pending.length);

  if (pending.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 30px 10px; font-size: 0.85rem;">
        ✅ Outbox empty. All offline inspections synchronized to central dispatch.
      </div>
    `;
    return;
  }

  list.innerHTML = '';
  pending.forEach(item => {
    const card = document.createElement('div');
    card.style.background = '#0f172a';
    card.style.border = '1px solid var(--border-color)';
    card.style.borderRadius = '6px';
    card.style.padding = '10px';
    card.style.fontSize = '0.8rem';

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; font-weight: 700;">
        <span style="color: var(--color-amber);">${item.unit_code}</span>
        <span style="font-family: var(--font-mono); color: var(--color-cyan);">${item.id.substring(0, 16)}...</span>
      </div>
      <div style="color: var(--text-muted); font-size: 0.72rem; margin-top: 4px;">
        HM: ${item.hour_meter} hrs | Shift: ${item.shift} | ${new Date(item.client_timestamp).toLocaleTimeString()}
      </div>
      <div style="font-family: var(--font-mono); font-size: 0.68rem; color: #64748b; margin-top: 4px; word-break: break-all;">
        HMAC: ${item.hmac_signature.substring(0, 24)}...
      </div>
    `;
    list.appendChild(card);
  });
}

function updateQueuePill(count) {
  const pill = document.getElementById('queuePill');
  pill.textContent = `Outbox: ${count} Pending`;
  if (count > 0) {
    pill.classList.add('has-pending');
  } else {
    pill.classList.remove('has-pending');
  }
}

// Setup Central Dispatch Controls
function setupDashboardControls() {
  document.getElementById('manualSyncBtn').addEventListener('click', () => {
    syncManager.triggerSync();
  });

  document.getElementById('refreshFleetBtn').addEventListener('click', () => {
    loadFleetOverview();
    loadSyncAuditLogs();
  });

  document.getElementById('resetDemoBtn').addEventListener('click', async () => {
    if (!confirm('Reset demo database to initial state?')) return;
    await fetch('/api/v1/dev/reset', { method: 'POST' });
    await loadFleetUnits();
    await loadFleetOverview();
    await loadSyncAuditLogs();
    showNotification('Demo database reset to factory state.');
  });
}

// Load Fleet Overview
async function loadFleetOverview() {
  try {
    const res = await fetch('/api/v1/fleet/overview');
    if (!res.ok) return;
    const data = await res.json();

    // KPIs
    document.getElementById('kpiTotal').textContent = data.summary.total_fleet || 0;
    document.getElementById('kpiReady').textContent = data.summary.ready_count || 0;
    document.getElementById('kpiGrounded').textContent = data.summary.grounded_count || 0;
    document.getElementById('kpiWarning').textContent = data.summary.warning_count || 0;

    // Table
    const tbody = document.getElementById('fleetTableBody');
    tbody.innerHTML = '';

    data.units.forEach(u => {
      const tr = document.createElement('tr');
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

      tr.innerHTML = `
        <td style="font-weight: 700; font-family: var(--font-mono);">${u.unit_code}</td>
        <td>${u.model}</td>
        <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
        <td style="font-family: var(--font-mono);">${u.last_hour_meter.toFixed(1)} hrs</td>
        <td style="color: var(--text-muted);">${u.current_pit_location}</td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.warn('Could not fetch fleet overview:', err.message);
  }
}

// Load Sync Audit Logs Stream
async function loadSyncAuditLogs() {
  try {
    const res = await fetch('/api/v1/sync/audit-logs?limit=15');
    if (!res.ok) return;
    const logs = await res.json();

    const stream = document.getElementById('syncAuditStream');
    if (logs.length === 0) {
      stream.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px;">No sync batches ingested yet.</div>';
      return;
    }

    stream.innerHTML = '';
    logs.forEach(log => {
      const item = document.createElement('div');
      item.className = 'stream-entry';
      item.innerHTML = `
        <div class="stream-header">
          <span>${log.batch_id}</span>
          <span style="color: var(--color-emerald); font-weight: 700;">-${log.compression_ratio_pct}% Bandwidth Saved</span>
        </div>
        <div class="stream-meta">
          Device: ${log.edge_device_id} | Raw: ${log.uncompressed_bytes}B -> Gzip: ${log.compressed_bytes}B | Records: ${log.records_inserted} inserted, ${log.records_deduplicated} dedup
        </div>
        <div style="font-size: 0.68rem; color: #64748b;">
          Synced at: ${log.synced_at} | HMAC Audit Verified
        </div>
      `;
      stream.appendChild(item);
    });
  } catch (err) {
    console.warn('Could not fetch sync audit logs:', err.message);
  }
}

function showNotification(msg) {
  console.log(`[PitOps Notification] ${msg}`);
}
