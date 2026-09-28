/** GET /api/seal/image?serial=&qr=1 — sealed PNG or expanded check QR */
import { getSeal, getPng, checkUrl } from './_seal.js';
import QRCode from 'qrcode';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end('method');
  }
  const url = new URL(req.url || '/', 'http://local');
  const serial = String(url.searchParams.get('serial') || '').toUpperCase();
  const wantQr = url.searchParams.get('qr') === '1';
  const seal = await getSeal(serial);
  if (!seal) {
    res.statusCode = 404;
    return res.end('not found');
  }

  if (wantQr) {
    const png = await QRCode.toBuffer(checkUrl(serial), {
      errorCorrectionLevel: 'M',
      type: 'png',
      margin: 2,
      width: 512,
      color: { dark: '#0a0f0a', light: '#ffffff' }
    });
    res.statusCode = 200;
    res.setHeader('content-type', 'image/png');
    res.setHeader('cache-control', 'public, max-age=300');
    return res.end(png);
  }

  const png = await getPng(serial);
  if (!png) {
    res.statusCode = 404;
    return res.end('image not ready');
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'image/png');
  res.setHeader('cache-control', 'public, max-age=60, s-maxage=300');
  res.setHeader('content-disposition', `inline; filename="${serial}.png"`);
  return res.end(png);
}
