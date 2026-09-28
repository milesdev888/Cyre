// CYRE Guardian — Mention Grader
// Cron: polls @Cyredev888 mentions, finds a Solana address in the text,
// grades it via cyre.dev/api/address, replies with the score card summary.
// Zero dependencies. Talks to X through the existing cyre-x-bridge MCP server,
// so no API keys live here — only BRIDGE_URL (with its secret path).
//
// Env:
//   BRIDGE_URL    e.g. https://cyre-x-bridge.onrender.com/mcp/<secret>   (required)
//   CYRE_API      default https://cyre.dev/api/address
//   INTERVAL_MIN  dedup window in minutes, match cron schedule (default 10)
//   DRY_RUN       "true" (default) = log replies only; set "false" for live cron posting
//   MAX_PER_RUN   default 5
//   BRAIN         "true" enables the Guardian voice line via guardian-brain.js
//   ANTHROPIC_API_KEY + BRAIN_MAX_PER_RUN — see guardian-brain.js

const BRIDGE = process.env.BRIDGE_URL;
const CYRE_API = process.env.CYRE_API || "https://cyre.dev/api/address";
const INTERVAL_MIN = parseInt(process.env.INTERVAL_MIN || "10", 10);
// HARD OFF: never live-post. Founder must delete this kill-switch to re-arm automation.
const DRY_RUN = true;
const MAX_PER_RUN = parseInt(process.env.MAX_PER_RUN || "5", 10);
if (String(process.env.X_WRITE_ENABLED || "").toLowerCase() === "true") {
  console.log("[grader] X_WRITE_ENABLED ignored — mention-grader is permanently dry-run until code is changed.");
}
const B58 = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
let brain = { voiceLine: async () => null, _enabled: () => false };
try { brain = require("./guardian-brain.cjs"); } catch (e) { console.log("[grader] brain module absent — template voice only"); }
const { callBridgeTool } = require("./bot-bridge.cjs");
if (!BRIDGE) {
  // Soft-exit: missing secret must not page the founder via cron fail mail.
  console.log("[grader] BRIDGE_URL not set — skipping run (exit 0).");
  process.exit(0);
}

async function callTool(name, args) {
  return callBridgeTool(name, args);
}

function grade(s){ return s<15?"A":s<30?"B":s<45?"C":s<60?"D":"F"; }
function degen(p){ return Math.min(100, Math.round((p.last24h||0)/6 + (p.failedPercent||0)*0.6 + ((p.transactionsSeen||0)>=1000?15:0))); }
function archetype(p){
  const bal=p.balanceSol||0, day=p.last24h||0, fail=p.failedPercent||0,
        age=p.ageDays||0, old=p.ageIsMinimum||age>730, idle=p.idleDays||0, seen=p.transactionsSeen||0;
  if(bal>=100) return "THE WHALE";
  if(fail>=25&&day>=200) return "THE MACHINE";
  if(day>=500) return "TERMINAL DEGEN";
  if(day>=100) return "THE DEGEN";
  if(old) return "THE OG";
  if(age<8) return "FRESH SPAWN";
  if(idle>90) return "THE SLEEPER";
  if(seen<20) return "THE TOURIST";
  return "THE REGULAR";
}
function shortAddr(a){ return a.slice(0,4) + "…" + a.slice(-4); }

function bridgeErrorText(x) {
  if (typeof x !== "string") return null;
  const s = x.trim();
  if (!s) return "empty bridge response";
  if (/^(Auth failed|X API \d+|Tool error)/i.test(s)) return s;
  if (/^bridge (error|non-JSON)/i.test(s)) return s;
  return null;
}

function extractTweets(x) {
  // tolerate several bridge response shapes
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.data)) return x.data;
  if (x && x.tweets && Array.isArray(x.tweets)) return x.tweets;
  // bridge text format: "@author [ISO date] (id 123): text..." per mention
  if (typeof x === "string") {
    if (bridgeErrorText(x)) return [];
    if (/^no recent mentions\.?$/i.test(x.trim())) return [];
    const out = [];
    const re = /@(\w+) \[([^\]]+)\] \(id (\d+)\):\s*([\s\S]*?)(?=\n@\w+ \[|\s*$)/g;
    let m;
    while ((m = re.exec(x)) !== null) {
      if (m[1].toLowerCase() === "cyredev888") continue; // never reply to ourselves
      out.push({ author: m[1], created_at: m[2], id: m[3], text: m[4].trim() });
    }
    return out;
  }
  return [];
}

async function gradeAddress(addr) {
  const r = await fetch(CYRE_API + "?address=" + encodeURIComponent(addr));
  const d = await r.json();
  if (!d || !d.ok) throw new Error("api: " + (d && d.error || r.status));
  return d;
}

function politeArchetype(p) {
  const a = archetype(p);
  const map = {
    "TERMINAL DEGEN": "Very active pattern",
    "THE DEGEN": "Active pattern",
    "THE MACHINE": "Automation-like pattern",
    "THE WHALE": "Large-balance pattern",
    "THE OG": "Long-history pattern",
    "FRESH SPAWN": "New-wallet pattern",
    "THE SLEEPER": "Quiet-then-active pattern",
    "THE TOURIST": "Light-history pattern",
    "THE REGULAR": "Steady pattern"
  };
  return map[a] || a;
}

function trimReply(text, maxLen) {
  const limit = maxLen || 280;
  if (text.length <= limit) return text;
  const suffix = "… Patterns, not verdicts. Full card → cyre.dev/score";
  const head = text.slice(0, Math.max(0, limit - suffix.length)).replace(/\s+\S*$/, "");
  return (head || text.slice(0, limit - 1)) + suffix;
}

function buildReply(addr, d, brainLine) {
  const p = d.profile || {};
  let out =
    "Thanks for tagging Guardian — a calm read on " + shortAddr(addr) + ":\n\n" +
    "Pattern grade: " + grade(d.score) + "\n" +
    "Pattern style: " + politeArchetype(p) + "\n" +
    "Activity intensity: " + degen(p) + "/100\n" +
    "Risk band: " + (d.riskLevel || "n/a") + "\n\n";
  if (brainLine) out += brainLine + "\n\n";
  out += "Patterns, not verdicts. Full card → cyre.dev/score";
  return trimReply(out);
}

(async () => {
  console.log("[grader] start", new Date().toISOString(), "DRY_RUN=" + DRY_RUN);
  let mentionsRaw;
  try { mentionsRaw = await callTool("get_mentions", {}); }
  catch (e) { console.error("[grader] get_mentions failed:", e.message); process.exit(0); }

  const bridgeErr = bridgeErrorText(mentionsRaw);
  if (bridgeErr) {
    console.error("[grader] bridge error:", bridgeErr.slice(0, 400));
    process.exit(0);
  }

  const tweets = extractTweets(mentionsRaw);
  console.log("[grader] mentions fetched:", tweets.length);
  if (!tweets.length) {
    console.log("[grader] no actionable mentions this run");
    if (typeof mentionsRaw === "string") console.log("[grader] bridge said:", mentionsRaw.slice(0, 200));
    else console.log("[grader] raw shape sample:", JSON.stringify(mentionsRaw).slice(0, 400));
    process.exit(0);
  }

  const cutoff = Date.now() - (INTERVAL_MIN + 2) * 60 * 1000;
  let handled = 0;

  for (const t of tweets) {
    if (handled >= MAX_PER_RUN) break;
    const id = t.id || t.id_str;
    const text = t.text || t.full_text || "";
    if (!id || !text) continue;

    // dedup by time window when created_at is present; otherwise DRY_RUN logs guide us
    if (t.created_at) {
      const ts = Date.parse(t.created_at);
      if (!isNaN(ts) && ts < cutoff) continue;
    }

    const m = text.match(B58);
    if (!m) continue;
    // first plausible address that isn't obviously a tx signature (sigs are 87-88 chars, already excluded by regex)
    const addr = m[0];

    let d;
    try { d = await gradeAddress(addr); }
    catch (e) { console.error("[grader] grade failed for", shortAddr(addr), e.message); continue; }

    const p = d.profile || {};
    const brainLine = await brain.voiceLine({
      grade: grade(d.score), archetype: archetype(p), degenLevel: degen(p),
      riskLevel: d.riskLevel || "n/a", ageDays: p.ageDays || 0,
      ageIsMinimum: !!p.ageIsMinimum, last24h: p.last24h || 0,
      failedPercent: p.failedPercent || 0, transactionsSeen: p.transactionsSeen || 0,
      idleDays: p.idleDays || 0
    });
    const reply = buildReply(addr, d, brainLine);
    console.log("[grader] DRAFT for tweet", id, "\n" + reply + "\n---");

    if (!DRY_RUN) {
      try {
        const out = await callTool("post_tweet", { text: reply, in_reply_to_tweet_id: String(id) });
        console.log("[grader] POSTED:", JSON.stringify(out).slice(0, 200));
      } catch (e) { console.error("[grader] post failed:", e.message); }
    }
    handled++;
  }
  console.log("[grader] done. handled:", handled);
  process.exit(0);
})();
