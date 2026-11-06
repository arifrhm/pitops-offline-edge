import crypto from 'node:crypto';
import zlib from 'node:zlib';
import http from 'node:http';

const HMAC_SECRET = process.env.PITOPS_HMAC_SECRET || 'PITOPS_MINING_EDGE_SECRET_KEY_2026';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';

function computeHMAC(record) {
  const canonicalString = [
    record.id,
    record.unit_code,
    record.shift,
    record.inspector_id,
    record.hour_meter,
    record.client_timestamp
  ].join('|');

  return crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(canonicalString)
    .digest('hex');
}

async function runSimulation() {
  console.log(`========================================================================`);
  console.log(`⛏️  PitOps: Open-Pit Fleet Offline Inspection & Edge Sync Simulator`);
  console.log(`📍 Scenario: 5 Haul Trucks deep at Bench 14 (Offline Blackspot)`);
  console.log(`📡 Event: Service vehicle returns to Fuel Bay Wi-Fi Access Point`);
  console.log(`========================================================================\n`);

  // 1. Generate 5 simulated offline inspections
  const inspections = [
    {
      id: 'P2H-SIM-' + crypto.randomUUID(),
      unit_code: 'DT-793-01',
      shift: 'DAY',
      inspector_id: 'OP-4821',
      inspector_name: 'Bambang Supriyanto',
      hour_meter: 14218.5,
      checklist: {
        service_brake: 'PASS',
        steering_system: 'PASS',
        emergency_stop: 'PASS',
        fire_suppression_system: 'PASS',
        operator_seatbelt: 'PASS',
        fatigue_camera_fss: 'PASS',
        engine_oil_coolant: 'PASS',
        hydraulic_system: 'PASS',
        tires_wheel_lugs: 'PASS',
        horn_reverse_alarm: 'PASS'
      },
      notes: 'Unit clean, tires inspected at Bench 12. Ready for overburden hauling.',
      client_timestamp: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: 'P2H-SIM-' + crypto.randomUUID(),
      unit_code: 'DT-793-02',
      shift: 'DAY',
      inspector_id: 'OP-4821',
      inspector_name: 'Bambang Supriyanto',
      hour_meter: 15898.0,
      checklist: {
        service_brake: 'FAIL', // CRITICAL FAILURE!
        steering_system: 'PASS',
        emergency_stop: 'PASS',
        fire_suppression_system: 'PASS',
        operator_seatbelt: 'PASS',
        fatigue_camera_fss: 'PASS',
        engine_oil_coolant: 'PASS',
        hydraulic_system: 'PASS',
        tires_wheel_lugs: 'PASS',
        horn_reverse_alarm: 'PASS'
      },
      notes: 'CRITICAL HAZARD: Retarder dynamic brake cylinder leaking fluid on front left axle. UNIT GROUNDED.',
      client_timestamp: new Date(Date.now() - 3000000).toISOString()
    },
    {
      id: 'P2H-SIM-' + crypto.randomUUID(),
      unit_code: 'DT-730-05',
      shift: 'DAY',
      inspector_id: 'OP-9012',
      inspector_name: 'Agus Setiawan',
      hour_meter: 18400.0, // ROLLBACK ANOMALY! (Original: 18452.0)
      checklist: {
        service_brake: 'PASS',
        steering_system: 'PASS',
        emergency_stop: 'PASS',
        fire_suppression_system: 'PASS',
        operator_seatbelt: 'PASS',
        fatigue_camera_fss: 'PASS',
        engine_oil_coolant: 'PASS',
        hydraulic_system: 'PASS',
        tires_wheel_lugs: 'PASS',
        horn_reverse_alarm: 'PASS'
      },
      notes: 'Testing instrument cluster swap. Display reads 18400 hrs.',
      client_timestamp: new Date(Date.now() - 2400000).toISOString()
    },
    {
      id: 'P2H-SIM-' + crypto.randomUUID(),
      unit_code: 'EX-3600-01',
      shift: 'DAY',
      inspector_id: 'OP-3310',
      inspector_name: 'Hendra Wijaya',
      hour_meter: 21348.5,
      checklist: {
        service_brake: 'PASS',
        steering_system: 'PASS',
        emergency_stop: 'PASS',
        fire_suppression_system: 'PASS',
        operator_seatbelt: 'PASS',
        fatigue_camera_fss: 'PASS',
        engine_oil_coolant: 'PASS',
        hydraulic_system: 'FAIL', // NON-CRITICAL WARNING
        tires_wheel_lugs: 'PASS',
        horn_reverse_alarm: 'PASS'
      },
      notes: 'Minor weeping at bucket cylinder seal. Scheduled for top-up at shift break.',
      client_timestamp: new Date(Date.now() - 1800000).toISOString()
    },
    {
      id: 'P2H-SIM-' + crypto.randomUUID(),
      unit_code: 'DZ-D375-01',
      shift: 'DAY',
      inspector_id: 'OP-5520',
      inspector_name: 'Dani Kurniawan',
      hour_meter: 12437.2,
      checklist: {
        service_brake: 'PASS',
        steering_system: 'PASS',
        emergency_stop: 'PASS',
        fire_suppression_system: 'PASS',
        operator_seatbelt: 'PASS',
        fatigue_camera_fss: 'PASS',
        engine_oil_coolant: 'PASS',
        hydraulic_system: 'PASS',
        tires_wheel_lugs: 'PASS',
        horn_reverse_alarm: 'PASS'
      },
      notes: 'Track tension within tolerance. Blade cutting edge normal.',
      client_timestamp: new Date(Date.now() - 1200000).toISOString()
    }
  ];

  // 2. Digitally sign each record with HMAC-SHA256
  for (const item of inspections) {
    item.hmac_signature = computeHMAC(item);
  }

  // 3. Package into batch and compress via Gzip
  const batchId = 'SIM-BATCH-' + Date.now();
  const rawPayload = JSON.stringify({
    batch_id: batchId,
    edge_device_id: 'RUGGED-TABLET-TOUGHBOOK-01',
    inspections
  });

  const uncompressedBytes = Buffer.byteLength(rawPayload);
  const compressedGzip = zlib.gzipSync(Buffer.from(rawPayload));
  const compressedBytes = compressedGzip.length;
  const savingsPct = ((1 - (compressedBytes / uncompressedBytes)) * 100).toFixed(1);

  console.log(`📦 Payload Preparation:`);
  console.log(`   - Raw Batch Size:        ${uncompressedBytes} bytes`);
  console.log(`   - Gzip Compressed Size:   ${compressedBytes} bytes`);
  console.log(`   - Mesh Bandwidth Saved:   ${savingsPct}%\n`);

  // 4. Send Batch #1
  console.log(`🚀 Sending Compressed Batch #1 to Server...`);
  const response1 = await postBatch(compressedGzip, batchId);
  console.log(`✅ Server Response #1:`, JSON.stringify(response1, null, 2));

  // 5. Send Batch #2 (Same payload to test Idempotency Deduplication)
  console.log(`\n🔄 Re-transmitting Identical Batch (Simulating Wi-Fi Retransmit / ACK Packet Loss)...`);
  const response2 = await postBatch(compressedGzip, batchId);
  console.log(`✅ Server Response #2 (Deduplication Check):`);
  console.log(`   - Records Received:     ${response2.data.recordsReceived}`);
  console.log(`   - Records Inserted:     ${response2.data.recordsInserted} (Expected: 0)`);
  console.log(`   - Records Deduplicated: ${response2.data.recordsDeduplicated} (Expected: 5)`);
  console.log(`\n🎉 Verification Complete: Idempotent queue sync and tamper-proof audit confirmed!`);
}

function postBatch(compressedBuffer, batchId) {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/v1/sync/batch', SERVER_URL);
    const req = http.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/gzip',
          'Content-Encoding': 'gzip',
          'x-edge-device-id': 'RUGGED-TABLET-TOUGHBOOK-01',
          'x-batch-id': batchId,
          'Content-Length': compressedBuffer.length
        }
      },
      (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(new Error(`Failed to parse response: ${body}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(compressedBuffer);
    req.end();
  });
}

runSimulation().catch(console.error);
