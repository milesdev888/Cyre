// api/cert-dissolve.js — POST /api/cert/dissolve
// Owner signed message → instant REVOKED. Old serial never reactivates.
// Personal photo hidden from verify page.

import { verifyCertSignedAction } from './_cert-auth.js';
import { getCertBySerial, dissolveCert, publicCertView, normalizeCertSerial } from './_cert-registry.js';

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
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
    const serial = normalizeCertSerial(body.serial);
    if (!serial || !String(serial).startsWith('CYR-')) {
      return res.status(400).json({ ok: false, error: 'CYR serial required' });
    }

    const cert = await getCertBySerial(serial);
    if (!cert || cert.legacyBadge) {
      return res.status(404).json({ ok: false, error: 'certificate not found' });
    }

    const wallet = String(body.wallet || '').trim();
    if (!wallet || wallet !== cert.ownerWallet) {
      return res.status(403).json({ ok: false, error: 'owner wallet required' });
    }

    const auth = await verifyCertSignedAction({
      wallet,
      action: 'dissolve',
      nonce: body.nonce,
      message: body.message,
      signature: body.signature
    });
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const updated = await dissolveCert(serial, body.reason || 'owner dissolve');
    return res.status(200).json({
      ok: true,
      cert: publicCertView(updated),
      note: 'REVOKED permanently. Scanning the old certificate or banner still lands on REVOKED.'
    });
  } catch (e) {
    console.error('cert dissolve failed', e && e.message);
    return res.status(500).json({ ok: false, error: (e && e.message) || 'dissolve failed' });
  }
}
