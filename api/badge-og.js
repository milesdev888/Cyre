// api/badge-og.js — GET /api/badge/og?serial=GRD-2026-00001 → 1200×630 PNG from LIVE check
// Crawler-friendly: supports HEAD, short live-scan timeout, longer CDN cache.

import { getBadgeBySerial, normalizeSerial } from './_badge-registry.js';
import { recheckIssuedPath, pathLabel, pathFamily, pathMark } from './_badge-qualify.js';
import { renderBadgeOg, formatUtc } from './_badge-og-render.js';
import { renderOfficialSeal } from './_badge-seal-render.js';

const SCAN_BASE = process.env.GUARDIAN_SCAN_URL || 'https://guardian-scan.onrender.com';
const LIVE_TIMEOUT_MS = Number(process.env.BADGE_OG_LIVE_TIMEOUT_MS || 1800);

function isCrawler(req) {
  const ua = String((req.headers && (req.headers['user-agent'] || req.headers['User-Agent'])) || '');
  return /Twitterbot|facebookexternalhit|LinkedInBot|Slackbot|Discordbot|WhatsApp|TelegramBot|OpenGraph|embedly|quora link preview|Googlebot|bingbot|Applebot/i.test(
    ua
  );
}

async function liveRecheck(badge, timeoutMs) {
  const url = `${SCAN_BASE}/api/scan?address=${encodeURIComponent(badge.mint)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'GuardianBadgeOG/2' },
      cache: 'no-store',
      signal: ctrl.signal
    });
    if (!r.ok) throw new Error(`scan HTTP ${r.status}`);
    const payload = await r.json();
    const family = badge.pathFamily || pathFamily(badge.qualifyPath);
    const q = recheckIssuedPath(payload, {
      pathFamily: family,
      qualifyPath: badge.qualifyPath,
      hasRevocationHistory: badge.status === 'REVOKED'
    });
    return {
      q,
      scannedAt: payload?.reports?.[0]?.scannedAt || payload?.scannedAt || new Date().toISOString()
    };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).end('method not allowed');

  const raw = String((req.query && (req.query.serial || req.query.id)) || '').trim();
  const serial = normalizeSerial(raw);
  if (!serial) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain');
    return res.end('serial required');
  }

  const badge = await getBadgeBySerial(serial);
  if (!badge) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain');
    return res.end('not found');
  }

  const family = badge.pathFamily || pathFamily(badge.qualifyPath);
  const isEstablished = family === 'established';
  let status = badge.status || 'VALID';
  let livePath = pathLabel(badge.qualifyPath) || badge.pathLabel || 'None';
  let liveGrade = badge.grade;
  let checkedAt = badge.issuedAt || new Date().toISOString();

  const pastExpiry =
    !isEstablished && badge.expiresAt ? Date.parse(badge.expiresAt) <= Date.now() : false;

  // Crawlers (X/Twitter etc.) need a sub-second image — skip live scan; use registry status
  // (auto-revoked on verify views). Humans still get a bounded live re-check.
  const crawler = isCrawler(req);
  if (!crawler) {
    try {
      const { q, scannedAt } = await liveRecheck(badge, LIVE_TIMEOUT_MS);
      checkedAt = scannedAt;
      livePath = q.pathLabel || pathLabel(q.path);
      liveGrade = q.grade || badge.grade;
      if (pastExpiry) status = 'EXPIRED';
      else if (!q.eligible) status = 'REVOKED';
      else status = 'VALID';
    } catch {
      // Timeout / scan miss: still render from issued record.
      if (pastExpiry) status = 'EXPIRED';
      checkedAt = new Date().toISOString();
    }
  } else {
    if (pastExpiry) status = 'EXPIRED';
    checkedAt = new Date().toISOString();
  }

  let sealPng = null;
  try {
    sealPng = await renderOfficialSeal({
      serial: badge.serial,
      ca: badge.mint,
      status,
      pathFamily: family,
      pathMark: pathMark(family || badge.qualifyPath),
      qualifyPath: badge.qualifyPath,
      grade: liveGrade || badge.grade || null
    });
  } catch {
    sealPng = null;
  }

  const png = renderBadgeOg({
    serial: badge.serial,
    symbol: badge.symbol,
    name: badge.name,
    pathLabel: badge.pathLabel || pathLabel(badge.qualifyPath),
    pathFamily: family,
    grade: badge.grade,
    score: badge.score,
    lpTier: isEstablished ? null : badge.lpTier,
    status,
    issuedAt: badge.issuedAt,
    liveGrade,
    livePath,
    checkedAt,
    sealPng
  });

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400');
  res.setHeader('Content-Length', String(png.length));
  res.setHeader('X-Guardian-Badge-Status', status);
  res.setHeader('X-Guardian-Badge-Checked-At', formatUtc(checkedAt));
  if (req.method === 'HEAD') return res.status(200).end();
  return res.status(200).end(png);
}
