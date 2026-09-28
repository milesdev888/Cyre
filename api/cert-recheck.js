// api/cert-recheck.js — Re-check job (cron every 3 days).
// Failed proofs → status Lapsed on that row only (certificate stays issued unless dissolved).

import { redisCommand, isDurableRedis } from './_redis.js';
import { getCertBySerial, saveCert, appendCertEvent } from './_cert-registry.js';
import { recheckProof } from './_cert-proofs.js';
import fs from 'node:fs';

const FILE_STORE = process.env.CERT_REGISTRY_STORE || '/tmp/cyre-cert-registry.json';
const CRON_SECRET = process.env.CRON_SECRET || process.env.CYRE_CRON_SECRET || '';

async function listAllSerials() {
  if (isDurableRedis()) {
    // Upstash/TCP: maintain a set cert:index of serials (best-effort)
    const row = await redisCommand(['LRANGE', 'cert:index', '0', '9999']);
    return (row && row.result) || [];
  }
  try {
    if (!fs.existsSync(FILE_STORE)) return [];
    const data = JSON.parse(fs.readFileSync(FILE_STORE, 'utf8'));
    return Object.keys((data && data.bySerial) || {});
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  const auth =
    (req.headers && (req.headers.authorization || req.headers['x-cron-secret'])) || '';
  const token = String(auth).replace(/^Bearer\s+/i, '').trim();
  if (CRON_SECRET && token !== CRON_SECRET) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  const serials = await listAllSerials();
  const results = [];
  for (const serial of serials) {
    const cert = await getCertBySerial(serial);
    if (!cert || cert.legacyBadge || cert.status === 'REVOKED') continue;
    let changed = false;
    const proofs = [];
    for (const p of cert.proofs || []) {
      const next = await recheckProof(p);
      if (next.status !== p.status) changed = true;
      proofs.push(next);
    }
    if (changed) {
      cert.proofs = proofs;
      await saveCert(cert);
      await appendCertEvent(serial, 'recheck', {
        lapsed: proofs.filter((p) => p.status === 'Lapsed').map((p) => p.kind)
      });
    }
    results.push({
      serial,
      changed,
      proofs: proofs.map((p) => ({ kind: p.kind, status: p.status }))
    });
  }

  return res.status(200).json({ ok: true, checked: results.length, results });
}
