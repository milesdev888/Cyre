// api/cert-blend.js — POST /api/cert/blend  { serial, imageBase64 } → blended 1500×500 PNG
import {
  getCertBySerial,
  normalizeCertSerial
} from './_cert-registry.js';
import { blendBannerCode } from './_cert-blend.js';
import { verifyCertSignedAction } from './_cert-auth.js';

const SITE = process.env.CYRE_SITE_URL || 'https://cyre.dev';

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
    if (!serial) return res.status(400).json({ ok: false, error: 'serial required' });
    const cert = await getCertBySerial(serial);
    if (!cert) return res.status(404).json({ ok: false, error: 'not found' });
    if (cert.status === 'REVOKED') {
      // Still allow blend so scanning old banners lands on REVOKED verify URL
    }

    // Owner signature required for new CYR certs; legacy GRD allows public regenerate of display blend
    if (cert.schema === 'cyre.cert.v1' && !cert.legacyBadge) {
      const wallet = String(body.wallet || '').trim();
      if (!wallet || wallet !== cert.ownerWallet) {
        return res.status(403).json({ ok: false, error: 'owner wallet required' });
      }
      const auth = await verifyCertSignedAction({
        wallet,
        action: 'regenerate',
        nonce: body.nonce,
        message: body.message,
        signature: body.signature
      });
      if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });
    }

    const b64 = String(body.imageBase64 || body.image || '').replace(/^data:image\/\w+;base64,/, '');
    if (!b64) return res.status(400).json({ ok: false, error: 'imageBase64 required (X banner PNG)' });
    const buf = Buffer.from(b64, 'base64');
    const url = `${SITE}/v/${encodeURIComponent(cert.serial)}`;
    const blended = await blendBannerCode(buf, url);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('X-Cyre-QR-Module-Px', String(blended.qrPx));
    return res.status(200).end(blended.png);
  } catch (e) {
    console.error('cert blend failed', e && e.message);
    return res.status(500).json({ ok: false, error: (e && e.message) || 'blend failed' });
  }
}
