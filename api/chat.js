// Cyre chat — hardened build (Aug 20, 2026)
// Blocks off-site abuse, caps spend, keeps the same {reply:""} fallback the frontend expects.

const MODEL = 'claude-haiku-4-5-20251001'; // ~10x cheaper than Sonnet for a site chatbot
const MAX_TOKENS = 250;
const DAILY_CAP = 150;        // hard ceiling on Anthropic calls per UTC day (~$1/day worst case)
const MAX_MSG_CHARS = 600;
const MAX_HISTORY = 6;

// Daily counter. In-memory per instance, so the real cap is DAILY_CAP x warm instances —
// still bounded, unlike before. Resets on the UTC date change.
let dayKey = '';
let dayCount = 0;

const SYSTEM = `You are Cyre, the AI assistant for Cyre (cyre.dev) — Synthetic Intelligence infrastructure for real-world assets on Solana. Be concise and helpful about CYRE's products and vision.
Hard rules: never state revenue, MRR, customer or user counts, transaction volumes, accuracy or uptime figures, protocol counts. Never discuss token price, token value, or give investment advice. If asked, say those figures aren't published and redirect to what the products do. CYRE is early-stage; nothing you say is an offer of securities.`;

function allowedOrigin(origin) {
  return /^https:\/\/(www\.)?cyre\.dev/.test(origin)
    || /^https:\/\/cyre-guardian-cyre\.vercel\.app/.test(origin)
    || /^https:\/\/[a-z0-9-]+-cyre\.vercel\.app/.test(origin);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  // 1. Origin gate — site fetch sends Origin. Allow cyre.dev + project vercel previews.
  const origin = req.headers.origin || req.headers.referer || '';
  if (!allowedOrigin(origin)) {
    res.status(403).json({ reply: '' }); return;
  }

  // 2. Daily spend cap.
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dayKey) { dayKey = today; dayCount = 0; }
  if (dayCount >= DAILY_CAP) { res.status(200).json({ reply: '' }); return; }

  // 3. Sanitize input — accept {messages:[...]} or legacy {message:"..."}.
  let history = [];
  try {
    let raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (!raw.length && typeof req.body?.message === 'string' && req.body.message.trim()) {
      raw = [{ role: 'user', content: req.body.message }];
    }
    history = raw
      .filter(m => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
      .slice(-MAX_HISTORY)
      .map(m => ({ role: m.role, content: m.content.slice(0, MAX_MSG_CHARS) }));
  } catch { history = []; }
  if (!history.length || history[history.length - 1].role !== 'user') {
    res.status(400).json({ error: 'No message' }); return;
  }

  try {
    dayCount++;
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM,
        messages: history
      })
    });
    const data = await r.json();
    const reply = data?.content?.find(b => b.type === 'text')?.text || '';
    res.status(200).json({ reply });
  } catch {
    res.status(200).json({ reply: '' }); // frontend falls back to demo replies
  }
}
