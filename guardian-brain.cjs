// CYRE Guardian — Brain module
// Turns structured facts from the crons into ONE line in Guardian's voice.
// Design: code finds, brain speaks, filter guards. If the model fails, times out,
// or breaks a rule, callers get null and fall back to their template — she can
// never go silent and never go rogue.
//
// Zero dependencies. Persona lives in GUARDIAN.md (repo root) — keep the system
// prompt below in sync with it.
//
// Env:
//   ANTHROPIC_API_KEY   required for the brain to activate (absent = brain off)
//   BRAIN               "true" to enable (default "false" — explicit opt-in)
//   BRAIN_MAX_PER_RUN   max model calls per cron run (default 5)

const KEY = process.env.ANTHROPIC_API_KEY || "";
const ENABLED = (process.env.BRAIN || "false").toLowerCase() === "true" && !!KEY;
const MAX_CALLS = parseInt(process.env.BRAIN_MAX_PER_RUN || "5", 10);
let calls = 0;

const SYSTEM =
  "You are Guardian, CYRE's synthetic intelligence watching real-world-asset activity on Solana. " +
  "Voice: calm, precise, polite, and courteous — a security analyst surprised by nothing. Never snide, " +
  "never mocking, never rude. Light wit is fine; never tease the person — only the on-chain pattern. " +
  "You will be given facts about one wallet. Reply with EXACTLY ONE polite line commenting on the pattern, " +
  "under 90 characters. Prefer warm understatement. " +
  "ABSOLUTE RULES: no digits or numbers of any kind (the facts are displayed separately); never the words " +
  "scam, safe, rug, guaranteed, moon, pump, loser, idiot, clown; no financial advice, no buy/sell/invest/price talk; " +
  "no promises or predictions; no emojis, hashtags, @mentions, links, or quotation marks; no revenue/user/accuracy/uptime " +
  "claims. If the facts are unremarkable, a kind understated line is correct. Output the line only — nothing else.";

const BANNED = /\b(scam|safe|rug|rugpull|guaranteed|moon|pump|dump|buy|sell|invest|investment|price|profit|returns?|revenue|accuracy|uptime|users?|customers?|apy|x\d)\b/i;

// Hard filter — every rule in GUARDIAN.md, enforced in code.
function clean(line) {
  if (!line || typeof line !== "string") return null;
  let s = line.replace(/\s+/g, " ").replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, "").trim();
  if (!s || s.length > 120) return null;          // length cap (90 asked, 120 hard)
  if (/\d/.test(s)) return null;                  // no digits, ever
  if (BANNED.test(s)) return null;                // banned vocabulary
  if (/https?:\/\/|www\.|@\w|#\w/.test(s)) return null; // no links/mentions/tags
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s)) return null; // no emoji
  return s;
}

// facts: { grade, archetype, degenLevel, riskLevel, ageDays, ageIsMinimum,
//          last24h, failedPercent, transactionsSeen, idleDays }
async function voiceLine(facts) {
  if (!ENABLED) return null;
  if (calls >= MAX_CALLS) { console.log("[brain] per-run cap reached"); return null; }
  calls++;

  const userMsg =
    "Wallet facts: pattern grade " + facts.grade +
    ", archetype " + facts.archetype +
    ", degen level " + facts.degenLevel + " of 100" +
    ", risk band " + facts.riskLevel +
    ", age about " + facts.ageDays + " days" + (facts.ageIsMinimum ? " (at least — window capped)" : "") +
    ", transactions in last day " + facts.last24h +
    ", failed transaction rate " + facts.failedPercent + " percent" +
    ", transactions seen " + facts.transactionsSeen +
    (facts.idleDays > 30 ? ", was idle about " + facts.idleDays + " days before recent activity" : "") +
    ". One line, Guardian's voice.";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 60,
        system: SYSTEM,
        messages: [{ role: "user", content: userMsg }]
      })
    });
    clearTimeout(timer);
    if (!res.ok) { console.error("[brain] api", res.status); return null; }
    const j = await res.json();
    const text = j && j.content && j.content[0] && j.content[0].text;
    const line = clean(text);
    if (!line) console.log("[brain] line rejected by filter:", JSON.stringify(text).slice(0, 140));
    return line;
  } catch (e) {
    clearTimeout(timer);
    console.error("[brain] failed:", e.message);
    return null;
  }
}

module.exports = { voiceLine, clean, _enabled: () => ENABLED };
