const fs = await import("node:fs/promises");
const path = await import("node:path");

const SCREENSHOT_DIR = "/Users/arifrahman/pitops-offline-edge/walkthrough_screenshots";
await fs.mkdir(SCREENSHOT_DIR, { recursive: true });

console.log("🚀 Starting PitOps Edge Walkthrough in ego-browser...");
const task = await taskSpace("pitops-live-walkthrough");
const page = task.page("p1");

console.log("🌐 Navigating to PitOps Edge (http://localhost:3001)...");
await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
await delay(1500);

// STEP 1: Initial State
console.log("📸 Step 1: Capturing initial Inspector screen...");
await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_initial_inspector_tablet.png") });

// STEP 2: Switch to Deep Pit Offline Mode
console.log("🔴 Step 2: Simulating Deep Pit Bench 14 (Offline Blackspot)...");
await page.click("#btn-pit-offline", { label: "Switch to Deep Pit Offline" });
await delay(800);
await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02_deep_pit_offline_mode.png") });

// STEP 3: Complete First Inspection (Clean Pass: DT-793-01)
console.log("⚡ Step 3: Inspecting Caterpillar 793F (Clean Pass)...");
await page.click("#btn-preset-clean", { label: "Load Clean Pass Preset" });
await delay(600);
await page.click("#btn-submit-p2h", { label: "Save Inspection to Dexie Outbox" });
await delay(1000);
await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03_first_inspection_saved_outbox.png") });

// STEP 4: Complete Second Inspection (Critical Brake Failure: DT-793-02)
console.log("🚨 Step 4: Inspecting Unit DT-793-02 with Critical Brake Failure...");
await page.click("#btn-preset-brake", { label: "Load Critical Brake Preset" });
await delay(600);
await page.click("#btn-submit-p2h", { label: "Save Second Inspection to Outbox" });
await delay(1000);
await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04_multiple_offline_inspections_in_outbox.png") });

// STEP 5: Reconnect to Tower LTE (Triggering Auto-Sync)
console.log("🟢 Step 5: Returning to surface Fuel Bay (Tower LTE Online)...");
await page.click("#btn-tower-online", { label: "Switch to Tower LTE Online" });
console.log("⏳ Waiting for auto-sync compression and cryptographic HMAC batch upload...");
await delay(2500);
await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05_auto_sync_completed_outbox_cleared.png") });

// STEP 6: Switch to Central Dispatch Dashboard
console.log("🛰️ Step 6: Switching to Central Dispatch & Telemetry Monitor...");
await page.click("#tab-btn-dispatch", { label: "Open Central Dispatch Tab" });
await delay(1500);
await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_central_dispatch_interlock_dashboard.png") });

// STEP 7: Switch to Architecture Tab
console.log("🏗️ Step 7: Viewing System Architecture & Kepmen 1827 Compliance...");
await page.click("#tab-btn-architecture", { label: "Open Architecture Tab" });
await delay(1000);
await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07_architecture_specs.png") });

console.log("✅ Walkthrough completed successfully! Closing task space...");
await task.finish({ keep: [] });

console.log("🎉 All 7 high-resolution screenshots saved to:", SCREENSHOT_DIR);
