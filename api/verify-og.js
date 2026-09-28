// api/verify-og.js — GET /api/verify/<serial>/og.png
// Dedicated verify-page OG card (1200×630, ≤300KB): seal + name/ticker + serial + status.
// Headline matches og:title: Guardian Verified · {name} (${ticker}) · {serial}.
// Status from LIVE registry only. Does not replace /api/seal/<serial>.png or /og.png.

import { getBadgeBySerial, normalizeSerial } from './_badge-registry.js';
import { pathMark, pathFamily } from './_badge-qualify.js';
import { renderVerifyOg, VERIFY_OG_W, VERIFY_OG_H } from './_badge-og-render.js';
import { renderOfficialSeal } from './_badge-seal-render.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).end('method not allowed');
  }

  let raw = String((req.query && (req.query.serial || req.query.id)) || '').trim();
  raw = raw.replace(/\.png$/i, '');
  const serial = normalizeSerial(raw);

  if (!serial) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain');
    return res.end('serial required');
  }

  const badge = await getBadgeBySerial(serial);
  if (!badge) {
    const png = renderVerifyOg({ serial, status: 'NOT FOUND', sealPng: null });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('X-Guardian-Verify-Og', 'NOT FOUND');
    res.setHeader('X-Guardian-Verify-Og-Size', `${VERIFY_OG_W}x${VERIFY_OG_H}`);
    res.setHeader('Content-Length', String(png.length));
    if (req.method === 'HEAD') return res.status(404).end();
    return res.status(404).end(png);
  }

  const status = badge.status || 'VALID';
  const family = badge.pathFamily || pathFamily(badge.qualifyPath);

  let sealPng = null;
  try {
    sealPng = await renderOfficialSeal({
      serial: badge.serial,
      ca: badge.mint,
      status,
      pathFamily: family,
      pathMark: pathMark(family || badge.qualifyPath),
      qualifyPath: badge.qualifyPath,
      grade: badge.grade || null,
      // Card scales the seal down — decorative QR would be unscannable.
      includeQr: false
    });
  } catch {
    sealPng = null;
  }

  const png = renderVerifyOg({
    serial: badge.serial,
    name: badge.name || null,
    symbol: badge.symbol || null,
    status,
    sealPng
  });

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=60');
  res.setHeader('X-Guardian-Verify-Og', status);
  res.setHeader('X-Guardian-Verify-Og-Serial', badge.serial);
  if (badge.name) res.setHeader('X-Guardian-Verify-Og-Name', String(badge.name));
  if (badge.symbol) res.setHeader('X-Guardian-Verify-Og-Ticker', String(badge.symbol));
  res.setHeader('X-Guardian-Verify-Og-Size', `${VERIFY_OG_W}x${VERIFY_OG_H}`);
  res.setHeader('Content-Length', String(png.length));
  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).end(png);
}
