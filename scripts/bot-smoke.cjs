#!/usr/bin/env node
// CYRE bot smoke test — checks bridge health, mention fetch, and address grading.
// Usage:
//   BRIDGE_URL=https://cyre-x-bridge.onrender.com/mcp/<secret> node scripts/bot-smoke.cjs
// Optional:
//   CYRE_API=https://cyre.dev/api/address
//   TEST_ADDRESS=5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9

const BRIDGE = process.env.BRIDGE_URL;
const CYRE_API = process.env.CYRE_API || "https://cyre.dev/api/address";
const TEST_ADDRESS = process.env.TEST_ADDRESS || "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";
const BRIDGE_ORIGIN = BRIDGE ? BRIDGE.replace(/\/mcp\/.*$/, "") : "";

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

function ok(msg) {
  console.log("OK:", msg);
}

async function callTool(name, args) {
  const { callBridgeTool } = require("../bot-bridge.cjs");
  return callBridgeTool(name, args);
}

(async () => {
  console.log("[bot-smoke] CYRE Guardian bot stack check\n");

  if (!BRIDGE) fail("Set BRIDGE_URL (https://cyre-x-bridge.onrender.com/mcp/<secret>)");

  if (BRIDGE_ORIGIN) {
    try {
      const hres = await fetch(BRIDGE_ORIGIN + "/health");
      const h = await hres.json();
      if (!h.ok) fail("bridge /health: " + JSON.stringify(h));
      ok("bridge health — " + (h.xAuth || "connected"));
    } catch (e) {
      fail("bridge /health unreachable: " + e.message);
    }
  }

  let verify;
  try {
    verify = await callTool("verify_connection", {});
  } catch (e) {
    fail("verify_connection: " + e.message);
  }
  if (typeof verify === "string" && verify.startsWith("Connected as @")) ok(verify);
  else fail("verify_connection unexpected: " + JSON.stringify(verify).slice(0, 200));

  let mentions;
  try {
    mentions = await callTool("get_mentions", { max_results: 5 });
  } catch (e) {
    fail("get_mentions: " + e.message);
  }
  ok("get_mentions returned (" + (typeof mentions === "string" ? mentions.split("\n").length : 0) + " lines)");

  const gradeRes = await fetch(CYRE_API + "?address=" + encodeURIComponent(TEST_ADDRESS));
  const grade = await gradeRes.json();
  if (!grade || !grade.ok) fail("CYRE API grade failed: " + JSON.stringify(grade).slice(0, 200));
  ok("CYRE API grade — score " + grade.score + ", risk " + grade.riskLevel);

  console.log("\n[bot-smoke] all checks passed.");
  console.log("Claude connector: unchanged — post_tweet via /mcp/<CONNECT_SECRET>");
  console.log("Cron live posting: Render DRY_RUN=false OR GitHub vars BOT_LIVE=true + secret BRIDGE_URL");
})();
