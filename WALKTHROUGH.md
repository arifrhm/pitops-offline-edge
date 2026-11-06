# PitOps Edge: Live Visual Walkthrough & Real Operations Demo

This document showcases the end-to-end automated walkthrough of **PitOps Edge** executed inside **ego-browser**, validating offline-first persistence, tamper-evident cryptographic signing, bandwidth compression, and automated safety interlocks against realistic open-pit mining operations.

---

## 📸 Visual Walkthrough Timeline

### Step 1: Initial Tablet Ready State
The rugged inspector tablet (`TABLET-PIT-2434`) loads cached heavy equipment fleet data from client **Dexie.js** (`fleet_cache`).
- **Initial Network:** `🟢 Tower LTE (Online)`
- **Outbox Status:** `0 Pending`

![Step 1 - Tablet Ready State](walkthrough_screenshots/01_initial_inspector_tablet.png)

---

### Step 2: Entering Deep Pit Bench 14 (Offline Blackspot)
The heavy equipment operator travels into deep open-pit benches (situated 350m below surface elevation). Cellular and Wi-Fi signals drop out completely.
- **Simulated Link:** Toggled to `🔴 Deep Pit (Offline)`
- **Client Behavior:** Background polling automatically pauses; all network calls are safely halted.

![Step 2 - Deep Pit Offline Mode](walkthrough_screenshots/02_deep_pit_offline_mode.png)

---

### Step 3: Conducting Clean Pre-Start Check (CAT 793F)
The operator inspects unit **DT-793-01** (Caterpillar 793F - 240 Ton Haul Truck). All 10 checklist items pass inspection.
- **Local Persistence:** Clicking *Save P2H Inspection* computes an **HMAC-SHA256 signature** locally via Web Crypto API and inserts the record into Dexie.js `outbox`.
- **Reactive UI:** Top badge updates immediately to **`Outbox: 1 Pending`**.

![Step 3 - First Inspection Saved Offline](walkthrough_screenshots/03_first_inspection_saved_outbox.png)

---

### Step 4: Critical Brake Hazard Detection (Komatsu 730E)
The inspector identifies a severe retarder brake cylinder leak on unit **DT-793-02**:
- **Critical Failure:** `service_brake` is flagged as **FAIL**.
- **Queued Offline:** Both inspections are safely queued in client IndexedDB with unique UUIDs and cryptographic signatures.
- **Queue Count:** **`Outbox: 2 Pending`** (Zero network packets sent, zero data loss).

![Step 4 - Multiple Inspections Queued](walkthrough_screenshots/04_multiple_offline_inspections_in_outbox.png)

---

### Step 5: Returning to Surface Fuel Bay (Automatic Batch Sync)
The service vehicle passes the surface Fuel Bay Wi-Fi Access Point / Tower LTE.
- **Link State Machine:** Network transitions to `🟢 Tower LTE (Online)`.
- **Sync Daemon Execution:**
  1. Gathers pending records from Dexie.js.
  2. Compresses the batch payload via browser native `CompressionStream('gzip')`.
  3. Transmits batch with idempotency key `BATCH-TABLET-PIT-2434-...`.
  4. Fastify server decompresses, verifies HMAC signatures, and returns HTTP 200.
  5. Client Dexie.js purges acknowledged outbox records (**`Outbox: 0 Pending`**).

![Step 5 - Auto-Sync Completed](walkthrough_screenshots/05_auto_sync_completed_outbox_cleared.png)

---

### Step 6: Central Dispatch & Safety Interlock Verification
The Central Dispatch monitor receives real-time operational fleet readiness:
- **DT-793-01:** Marked as **`READY`** for overburden hauling.
- **DT-793-02:** Interlocked to **`GROUNDED (CRITICAL)`** — automatic safety interlock blocks unit from FMS dispatch until workshop clearance.
- **Sync Telemetry Stream:**
  - Raw Payload: `3,436 Bytes` → Compressed Gzip: `1,146 Bytes` (**66.6% Wireless Bandwidth Saved**).
  - Cryptographic Verification: **`HMAC Audit Verified`**.

![Step 6 - Central Dispatch & Safety Interlock](walkthrough_screenshots/06_central_dispatch_interlock_dashboard.png)

---

### Step 7: Architecture & Kepmen 1827 Compliance
Overview of system architecture mapping to the **Purdue Model (ISA-95)** and compliance with Indonesian Ministry of Energy and Mineral Resources regulations (**Kepmen ESDM No. 1827 K/30/MEM/2018**).

![Step 7 - Architecture & Kepmen 1827 Compliance](walkthrough_screenshots/07_architecture_specs.png)

---

## 🤖 Re-Running the Walkthrough

You can re-run the exact automated browser walkthrough using:

```bash
# Ensure server is running on port 3001
npm start

# In a separate terminal:
ego-browser nodejs < scripts/run_walkthrough.js
```
