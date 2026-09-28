// api/chain-pulse.js — lightweight Solana liveness for the site UI
// One getSlot per cache window (default 30s). No wallet scans, no LLM.
// Env: SOLANA_RPC, CHAIN_PULSE_CACHE_SEC (default 30)

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const CACHE_SEC = Math.min(Math.max(parseInt(process.env.CHAIN_PULSE_CACHE_SEC || '30', 10), 10), 120);

let cache = { at: 0, payload: null };

async function getSlot() {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot', params: [{ commitment: 'processed' }] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'RPC error');
  return d.result;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const now = Date.now();
  if (cache.payload && now - cache.at < CACHE_SEC * 1000) {
    return res.status(200).json({ ...cache.payload, cached: true, cacheAgeSec: Math.floor((now - cache.at) / 1000) });
  }

  try {
    const slot = await getSlot();
    const fetchedAt = new Date().toISOString();
    const payload = {
      ok: true,
      kind: 'cyre-chain-pulse',
      version: 1,
      watching: true,
      network: 'mainnet-beta',
      slot,
      fetchedAt,
      disclaimer: 'Light chain pulse only — not a wallet scan.',
      mode: 'light-pulse',
    };
    cache = { at: now, payload };
    return res.status(200).json({ ...payload, cached: false, cacheAgeSec: 0 });
  } catch (e) {
    console.error('chain-pulse', e && e.message);
    return res.status(200).json({
      ok: false,
      kind: 'cyre-chain-pulse',
      version: 1,
      watching: false,
      network: 'mainnet-beta',
      slot: null,
      fetchedAt: new Date().toISOString(),
      error: 'Could not reach Solana RPC. Retry shortly.',
    });
  }
}
