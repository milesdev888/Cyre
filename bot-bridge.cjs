// bot-bridge.js — shared MCP bridge client for CYRE cron bots
// Env: BRIDGE_URL (required) e.g. https://cyre-x-bridge.onrender.com/mcp/<secret>

const BRIDGE = process.env.BRIDGE_URL;

async function callBridgeTool(name, args) {
  if (!BRIDGE) throw new Error("BRIDGE_URL not set");
  const res = await fetch(BRIDGE, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args || {} },
    }),
  });
  const raw = await res.text();
  let payload = raw;
  if (raw.startsWith("event:") || raw.includes("\ndata:")) {
    const m = raw.match(/data:\s*(\{[\s\S]*\})/);
    if (m) payload = m[1];
  }
  let j;
  try {
    j = JSON.parse(payload);
  } catch {
    throw new Error("bridge non-JSON: " + raw.slice(0, 200));
  }
  if (j.error) throw new Error("bridge error: " + JSON.stringify(j.error).slice(0, 300));
  const c = j.result && j.result.content;
  const text = Array.isArray(c) ? c.map((b) => b.text || "").join("\n") : "";
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function postTweet(text, inReplyToTweetId) {
  // Kill-switch: cron/bots must never write to X unless founder sets X_WRITE_ENABLED=true.
  if (String(process.env.X_WRITE_ENABLED || "").toLowerCase() !== "true") {
    return "REFUSED: X writes disabled (X_WRITE_ENABLED!=true)";
  }
  const args = { text: String(text).slice(0, 280) };
  if (inReplyToTweetId) args.in_reply_to_tweet_id = String(inReplyToTweetId);
  return callBridgeTool("post_tweet", args);
}

module.exports = { callBridgeTool, postTweet, bridgeConfigured: () => !!BRIDGE };
