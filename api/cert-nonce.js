// api/cert-nonce.js — POST /api/cert/nonce
// Issues a one-time, 30-minute, cyre.dev-bound message for claim | dissolve | regenerate | transfer.

import { issueNonce } from './_cert-auth.js';

const ACTIONS = new Set(['claim', 'dissolve', 'regenerate', 'transfer', 'proof']);

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  try {
    const body = await readBody(req);
    const action = String(body.action || '').trim().toLowerCase();
    const wallet = String(body.wallet || '').trim();
    if (!ACTIONS.has(action)) {
      return res.status(400).json({
        ok: false,
        error: 'action must be claim|dissolve|regenerate|transfer|proof'
      });
    }
    if (!wallet) return res.status(400).json({ ok: false, error: 'wallet required' });

    const extra = body.extra ? String(body.extra).slice(0, 500) : undefined;
    const issued = await issueNonce({ action, wallet, extra });
    return res.status(200).json({
      ok: true,
      ...issued,
      note: 'Sign this message only. Cyre never asks you to approve a transaction.'
    });
  } catch (e) {
    return res.status(400).json({ ok: false, error: (e && e.message) || 'nonce failed' });
  }
}
