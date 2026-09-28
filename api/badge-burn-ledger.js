// api/badge-burn-ledger.js — Public burn ledger for $C7 badge payments.
// GET lists entries. Founder may POST { action: 'mark_burned', id, weeklyBurnTx }.

import { listBurnLedger, getBurnEntry, markWeeklyBurned } from './_badge-burn-ledger.js';

function readBody(req) {
  const b = req.body;
  if (!b) return null;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch (e) {
      return null;
    }
  }
  return b;
}

function founderAuthorized(req) {
  const key = process.env.BADGE_FOUNDER_KEY || process.env.X402_INTERNAL_KEY || '';
  if (!key) return false;
  const hdr =
    (req.headers && (req.headers['x-guardian-key'] || req.headers['X-Guardian-Key'])) || '';
  return String(hdr) === key;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-guardian-key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    const id = String((req.query && req.query.id) || '').trim();
    if (id) {
      const entry = await getBurnEntry(id);
      if (!entry) return res.status(404).json({ ok: false, error: 'not found' });
      return res.status(200).json({ ok: true, entry });
    }
    const entries = await listBurnLedger({ limit: Number(req.query && req.query.limit) || 100 });
    return res.status(200).json({
      ok: true,
      count: entries.length,
      entries,
      note: 'All C7 payments burned weekly · tx published (The $C7 Loop).'
    });
  }

  if (req.method === 'POST') {
    if (!founderAuthorized(req)) {
      return res.status(401).json({ ok: false, error: 'founder key required' });
    }
    const body = readBody(req) || {};
    if (String(body.action || '') !== 'mark_burned') {
      return res.status(400).json({ ok: false, error: 'action must be mark_burned' });
    }
    const entry = await markWeeklyBurned(body.id, body.weeklyBurnTx);
    if (!entry) return res.status(404).json({ ok: false, error: 'not found' });
    return res.status(200).json({ ok: true, entry });
  }

  return res.status(405).json({ ok: false, error: 'method not allowed' });
}
