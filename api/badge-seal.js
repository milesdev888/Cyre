// api/badge-seal.js — GET /api/seal/<serial>.png (+ /og.png + /ui.png)
// Renders from LIVE registry status only (anti-copy). Unknown → 404 placeholder PNG.
// Full-res (+ QR) at /api/seal/<serial>.png
// OG crawlers: /api/seal/<serial>/og.png (indexed, opaque — social cards)
// On-page UI: /api/seal/<serial>/ui.png (RGBA transparent thumb, no QR)

import { getBadgeBySerial, normalizeSerial } from './_badge-registry.js';
import { pathMark, pathFamily } from './_badge-qualify.js';
import {
  renderOfficialSeal,
  renderOfficialSealOg,
  renderOfficialSealUi,
  renderMissingSealPng,
  SEAL_OG_SIZE,
  SEAL_UI_SIZE
} from './_badge-seal-render.js';

function wantsOg(req) {
  const q = (req.query && (req.query.og || req.query.variant)) || '';
  const s = String(q).toLowerCase();
  return s === '1' || s === 'true' || s === 'og';
}

function wantsUi(req) {
  const q = (req.query && (req.query.ui || req.query.variant)) || '';
  const s = String(q).toLowerCase();
  return s === '1' || s === 'true' || s === 'ui';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).end('method not allowed');
  }

  const og = wantsOg(req);
  const ui = !og && wantsUi(req);
  let raw = String((req.query && (req.query.serial || req.query.id)) || '').trim();
  // Support /api/seal/GRD-2026-00001.png via rewrite query
  raw = raw.replace(/\.png$/i, '');
  const serial = normalizeSerial(raw);

  if (!serial) {
    const png = renderMissingSealPng();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('X-Guardian-Seal', 'MISSING');
    if (og) res.setHeader('X-Guardian-Seal-Variant', 'og');
    if (ui) res.setHeader('X-Guardian-Seal-Variant', 'ui');
    if (req.method === 'HEAD') return res.status(404).end();
    return res.status(404).end(png);
  }

  const badge = await getBadgeBySerial(serial);
  if (!badge) {
    const png = renderMissingSealPng();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('X-Guardian-Seal', 'MISSING');
    if (og) res.setHeader('X-Guardian-Seal-Variant', 'og');
    if (ui) res.setHeader('X-Guardian-Seal-Variant', 'ui');
    if (req.method === 'HEAD') return res.status(404).end();
    return res.status(404).end(png);
  }

  const status = badge.status || 'VALID';
  const family = badge.pathFamily || pathFamily(badge.qualifyPath);
  const input = {
    serial: badge.serial,
    ca: badge.mint,
    status,
    pathFamily: family,
    pathMark: pathMark(family || badge.qualifyPath),
    qualifyPath: badge.qualifyPath,
    grade: badge.grade || null
  };
  const png = og
    ? await renderOfficialSealOg(input)
    : ui
      ? await renderOfficialSealUi(input)
      : await renderOfficialSeal(input);

  res.setHeader('Content-Type', 'image/png');
  // ≤10 min TTL so revocation propagates; allow SWR
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=60');
  res.setHeader('X-Guardian-Seal', status);
  res.setHeader('X-Guardian-Seal-Serial', badge.serial);
  if (family) res.setHeader('X-Guardian-Seal-Path', pathMark(family) || family);
  if (og) {
    res.setHeader('X-Guardian-Seal-Variant', 'og');
    res.setHeader('X-Guardian-Seal-Size', String(SEAL_OG_SIZE));
  } else if (ui) {
    res.setHeader('X-Guardian-Seal-Variant', 'ui');
    res.setHeader('X-Guardian-Seal-Size', String(SEAL_UI_SIZE));
  }
  res.setHeader('Content-Length', String(png.length));
  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).end(png);
}
