// api/cert-image.js — GET /api/cert/:serial.png  (also ?serial=)
import {
  getCertBySerial,
  normalizeCertSerial,
  resolveShortSerial
} from './_cert-registry.js';
import { renderCertificatePng } from './_cert-image.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  let raw = String((req.query && (req.query.serial || req.query.id)) || '').trim();
  // Path style /api/cert/CYR-….png arrives rewritten with ?serial=
  if (!raw && req.url) {
    const m = String(req.url).match(/\/api\/cert\/([^/?]+)/i);
    if (m) raw = decodeURIComponent(m[1]).replace(/\.png$/i, '');
  }

  let serial = normalizeCertSerial(raw);
  if (serial && /^\d+$/.test(serial)) serial = await resolveShortSerial(serial);
  if (!serial) {
    return res.status(400).json({ ok: false, error: 'serial required' });
  }

  const cert = await getCertBySerial(serial);
  if (!cert) {
    return res.status(404).json({ ok: false, error: 'not found' });
  }

  const png = await renderCertificatePng(cert);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=60, must-revalidate');
  return res.status(200).end(png);
}
