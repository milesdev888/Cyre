// api/cert-get.js — GET /api/cert?serial=  public certificate + events (verify page data)
import {
  getCertBySerial,
  listCertEvents,
  publicCertView,
  normalizeCertSerial,
  resolveShortSerial
} from './_cert-registry.js';

const SITE = process.env.CYRE_SITE_URL || 'https://cyre.dev';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  let raw = String((req.query && (req.query.serial || req.query.id)) || '').trim();
  let serial = normalizeCertSerial(raw);
  if (serial && /^\d+$/.test(serial)) {
    serial = (await resolveShortSerial(serial)) || serial;
  }
  if (!serial) {
    return res.status(200).json({
      ok: true,
      howTo: 'GET /api/cert?serial=CYR-2026-00001 or GRD-2026-00002',
      note: 'Cyre never asks you to approve a transaction.'
    });
  }

  const cert = await getCertBySerial(serial);
  if (!cert) {
    return res.status(404).json({ ok: false, error: 'not found', serial });
  }

  const events = cert.legacyBadge ? [] : await listCertEvents(cert.serial);
  const matchQ = String((req.query && req.query.match) || '').trim();
  let match = null;
  if (matchQ) {
    const q = matchQ.toLowerCase().replace(/^@/, '');
    const hit = (cert.proofs || []).some((p) => {
      const d = String(p.display || '').toLowerCase().replace(/^@/, '');
      const id = String(p.id || '').toLowerCase();
      // Exact match only: a look-alike handle (e.g. an extra underscore) must not match.
      return d === q || id === q;
    });
    match = hit ? 'Match' : 'Not this owner';
  }

  return res.status(200).json({
    ok: true,
    cert: publicCertView(cert),
    events,
    match,
    imageUrl: `${SITE}/api/cert/${encodeURIComponent(cert.serial)}.png`,
    verifyUrl: `${SITE}/v/${encodeURIComponent(cert.serial)}`,
    note: 'Cyre never asks you to approve a transaction.'
  });
}
