// api/_badge-seal-render.js — Seal Pass 2: 1800×1800 official medallion + engraved band + QR.
// Band from registry only: ✦ {serial} ✦ {PATH} ✦ {ca}  PATH ∈ SECURED | ESTABLISHED
// Base art gets a trophy-gold levels pass before composite; plate is transparent RGBA.
// Pure Node (+ qrcode). Medallion + glyph atlas from /brand/seals.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import QRCode from 'qrcode';
import { decodePng, encodePng, encodePngRgb, encodeOgPng, downscaleRgba } from './_badge-og-render.js';
import { AA_PLATINUM } from '../brand/aa-platinum.js';

export const SEAL_CANVAS = 1800;
/** Compressed OG unfurl size — ~1024px square, palette PNG under 300KB. */
export const SEAL_OG_SIZE = 1024;
export const SEAL_OG_COLORS = 64;
/** On-page UI thumb — RGBA transparent, no QR (too small to scan). */
export const SEAL_UI_SIZE = 256;
const BAND_R = 760;
const GUIDE_INNER = 728;
const GUIDE_OUTER = 852;
const GOLD_HI = [248, 224, 118];
const GOLD_LO = [212, 168, 52];
/** Platinum cool sheen for AA path words — from brand/aa-platinum.js (shared). */
const PLAT_HI = AA_PLATINUM.rgb.hi;
const PLAT_LO = AA_PLATINUM.rgb.steel;
/**
 * Trophy-gold levels — match bright metallic yellow-gold reference
 * (assets/5f4d0e6e…), NOT amber/bronze/orange. Demo band text is AI-garbled
 * and must NEVER be used as the seal; only color/brightness is the target.
 * Applied to base art only; band + QR stay registry-engraved afterward.
 *
 * Midtone lift ≈ +30% (target +25–35%). Raises G/R toward ~0.70–0.78 so mids
 * read yellow-gold instead of orange.
 */
const TROPHY_MID_LIFT = 0.30;
const TROPHY_CONTRAST = 1.18;
const TROPHY_SAT = 1.16;
/** Target green/red ratio in gold midtones (reference ≈ 0.70). */
const TROPHY_YELLOW_GR = 0.74;
const TROPHY_YELLOW_PULL = 0.55;
/** Keep blue low — trophy gold, not brass mud. */
const TROPHY_BLUE_KEEP = 0.42;
const TROPHY_PIVOT = 142;
const SITE = process.env.GUARDIAN_SITE_URL || 'https://cyre.dev';
/**
 * Full-res QR — hard lock: **data modules** (size×scale, not quiet zone) ≥ 14% of
 * shortest edge. On 1800 master that is ≥252px of black/white modules; quiet zone
 * is additive outside that floor. Prior code counted quiet toward 14%, so data
 * modules read ~203px / 11.2% on live seals.
 */
export const QR_PCT = 0.14;
/** Spec quiet-zone modules on each side (opaque white). zbar needs ≥4. */
const QR_QUIET_MODULES = 4;
/** ECC M keeps module count low; Q only if payload needs it. */
const QR_ECC = 'M';

/**
 * Absolute verify URL for QR payloads.
 * Uses `/verify/:serial` (live on cyre.dev today). A shorter `/v/:serial` alias
 * exists in vercel.json for after deploy, but QR must encode a URL that already
 * resolves — iPhone cameras hitting a 404 are worse than one extra path segment.
 * @param {string} serial
 * @returns {string}
 */
export function sealVerifyUrl(serial) {
  const s = String(serial || '').trim().toUpperCase();
  return `${SITE}/verify/${encodeURIComponent(s)}`;
}

function assetPath(...parts) {
  const candidates = [
    path.join(process.cwd(), ...parts),
    path.join('/var/task', ...parts)
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

let medallionCache = null;
let atlasCache = null;

function loadMedallion() {
  if (medallionCache) return medallionCache;
  const p = assetPath('brand', 'seals', 'guardian-seal-medallion.png');
  if (!p) throw new Error('medallion asset missing');
  medallionCache = decodePng(fs.readFileSync(p));
  return medallionCache;
}

/**
 * Brightness/levels pass on base medallion before compositing.
 * Color/brightness matched to the trophy-gold reference demo; band + QR drawn after stay crisp.
 * @param {{ rgba: Buffer, width: number, height: number }} img
 * @returns {{ rgba: Buffer, width: number, height: number }}
 */
export function brightenTrophyGold(img) {
  const { rgba: src, width, height } = img;
  const out = Buffer.from(src);
  const mid = TROPHY_PIVOT;
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] < 1) continue;
    let r = out[i];
    let g = out[i + 1];
    let b = out[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const t = lum / 255;
    // Bell weight peaks in midtones; preserves deep shadows + specular highlights.
    const midW = 4 * t * (1 - t);
    const lift = TROPHY_MID_LIFT * midW * 255;
    r = Math.min(255, r + lift);
    g = Math.min(255, g + lift * 1.05);
    b = Math.min(255, b + lift * TROPHY_BLUE_KEEP);

    // Mild contrast around a brighter gold pivot
    r = Math.max(0, Math.min(255, (r - mid) * TROPHY_CONTRAST + mid));
    g = Math.max(0, Math.min(255, (g - mid) * TROPHY_CONTRAST + mid));
    b = Math.max(0, Math.min(255, (b - mid) * TROPHY_CONTRAST + mid));

    // Yellow-gold hue pull: raise G toward target G/R in warm midtones (not orange).
    if (r > 70 && r >= g && g >= b) {
      const targetG = r * TROPHY_YELLOW_GR;
      if (g < targetG) {
        g = g + (targetG - g) * TROPHY_YELLOW_PULL * midW;
      }
      // Cap blue under green so mids stay yellow, not bronze.
      const maxB = g * TROPHY_BLUE_KEEP;
      if (b > maxB) b = b + (maxB - b) * 0.65;
    }

    // Saturation toward trophy gold (hold blue down)
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    r = Math.max(0, Math.min(255, gray + (r - gray) * TROPHY_SAT));
    g = Math.max(0, Math.min(255, gray + (g - gray) * TROPHY_SAT * 1.04));
    b = Math.max(0, Math.min(255, gray + (b - gray) * (TROPHY_SAT * 0.72)));

    out[i] = Math.round(r);
    out[i + 1] = Math.round(g);
    out[i + 2] = Math.round(b);
  }
  return { rgba: out, width, height };
}

function loadAtlas() {
  if (atlasCache) return atlasCache;
  const pngPath = assetPath('brand', 'seals', 'glyph-atlas.png');
  const jsonPath = assetPath('brand', 'seals', 'glyph-atlas.json');
  if (!pngPath || !jsonPath) throw new Error('glyph atlas missing');
  atlasCache = {
    img: decodePng(fs.readFileSync(pngPath)),
    meta: JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  };
  return atlasCache;
}

function fillRect(rgba, W, H, x, y, w, h, r, g, b, a = 255) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 4;
      const srcA = a / 255;
      const dstA = rgba[i + 3] / 255;
      const outA = srcA + dstA * (1 - srcA);
      if (outA <= 0) continue;
      rgba[i] = Math.round((r * srcA + rgba[i] * dstA * (1 - srcA)) / outA);
      rgba[i + 1] = Math.round((g * srcA + rgba[i + 1] * dstA * (1 - srcA)) / outA);
      rgba[i + 2] = Math.round((b * srcA + rgba[i + 2] * dstA * (1 - srcA)) / outA);
      rgba[i + 3] = Math.round(outA * 255);
    }
  }
}

function blitScaled(dst, dw, dh, srcImg, dx, dy, tw, th) {
  const { rgba: src, width: sw, height: sh } = srcImg;
  for (let y = 0; y < th; y++) {
    const sy = ((y + 0.5) * sh) / th - 0.5;
    const y0 = Math.max(0, Math.min(sh - 1, Math.floor(sy)));
    const y1 = Math.max(0, Math.min(sh - 1, y0 + 1));
    const ty = sy - y0;
    for (let x = 0; x < tw; x++) {
      const sx = ((x + 0.5) * sw) / tw - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(sx)));
      const x1 = Math.max(0, Math.min(sw - 1, x0 + 1));
      const tx = sx - x0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const px = dx + x;
      const py = dy + y;
      if (px < 0 || py < 0 || px >= dw || py >= dh) continue;
      const sa =
        (src[i00 + 3] * (1 - tx) + src[i10 + 3] * tx) * (1 - ty) +
        (src[i01 + 3] * (1 - tx) + src[i11 + 3] * tx) * ty;
      if (sa < 1) continue;
      const sr =
        (src[i00] * (1 - tx) + src[i10] * tx) * (1 - ty) +
        (src[i01] * (1 - tx) + src[i11] * tx) * ty;
      const sg =
        (src[i00 + 1] * (1 - tx) + src[i10 + 1] * tx) * (1 - ty) +
        (src[i01 + 1] * (1 - tx) + src[i11 + 1] * tx) * ty;
      const sb =
        (src[i00 + 2] * (1 - tx) + src[i10 + 2] * tx) * (1 - ty) +
        (src[i01 + 2] * (1 - tx) + src[i11 + 2] * tx) * ty;
      const di = (py * dw + px) * 4;
      const srcA = sa / 255;
      const dstA = dst[di + 3] / 255;
      const outA = srcA + dstA * (1 - srcA);
      dst[di] = Math.round((sr * srcA + dst[di] * dstA * (1 - srcA)) / outA);
      dst[di + 1] = Math.round((sg * srcA + dst[di + 1] * dstA * (1 - srcA)) / outA);
      dst[di + 2] = Math.round((sb * srcA + dst[di + 2] * dstA * (1 - srcA)) / outA);
      dst[di + 3] = Math.round(outA * 255);
    }
  }
}

function drawGuideRing(rgba, W, H, cx, cy, radius, r, g, b, a) {
  for (let deg = 0; deg < 360; deg += 0.35) {
    const rad = (deg * Math.PI) / 180;
    const x = Math.round(cx + radius * Math.cos(rad));
    const y = Math.round(cy + radius * Math.sin(rad));
    fillRect(rgba, W, H, x - 1, y - 1, 2, 2, r, g, b, a);
  }
}

function sampleAtlasGlyph(atlas, ch) {
  const { img, meta } = atlas;
  const g = meta.glyphs[ch] || meta.glyphs['-'] || meta.glyphs[' '];
  if (!g) return null;
  // Strip atlas: { x, w, h } — or legacy grid: { col, row } + cellW/cellH
  let x0;
  let y0;
  let cellW;
  let cellH;
  let adv;
  if (typeof g.x === 'number') {
    x0 = g.x;
    y0 = 0;
    cellW = g.w;
    cellH = g.h || meta.height || img.height;
    adv = g.adv || g.w;
  } else {
    cellW = meta.cellW;
    cellH = meta.cellH;
    x0 = g.col * cellW;
    y0 = g.row * cellH;
    adv = g.adv || cellW;
  }
  if (!(cellW > 0) || !(cellH > 0)) return null;
  const buf = Buffer.alloc(cellW * cellH * 4);
  for (let y = 0; y < cellH; y++) {
    for (let x = 0; x < cellW; x++) {
      const sx = Math.min(img.width - 1, x0 + x);
      const sy = Math.min(img.height - 1, y0 + y);
      const si = (sy * img.width + sx) * 4;
      const di = (y * cellW + x) * 4;
      buf[di] = img.rgba[si];
      buf[di + 1] = img.rgba[si + 1];
      buf[di + 2] = img.rgba[si + 2];
      buf[di + 3] = img.rgba[si + 3];
    }
  }
  return { rgba: buf, width: cellW, height: cellH, adv };
}

function tintGlyph(glyph, rgb) {
  const out = Buffer.from(glyph.rgba);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] < 1) continue;
    // white body → gold; dark shadow stays dark
    const lum = (out[i] + out[i + 1] + out[i + 2]) / 3;
    if (lum > 80) {
      out[i] = rgb[0];
      out[i + 1] = rgb[1];
      out[i + 2] = rgb[2];
    }
  }
  return { ...glyph, rgba: out };
}

function rotateGlyph(glyph, deg) {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sw = glyph.width;
  const sh = glyph.height;
  const cx = sw / 2;
  const cy = sh / 2;
  const corners = [
    [0, 0],
    [sw, 0],
    [sw, sh],
    [0, sh]
  ].map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    return [dx * cos - dy * sin, dx * sin + dy * cos];
  });
  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const minX = Math.floor(Math.min(...xs));
  const maxX = Math.ceil(Math.max(...xs));
  const minY = Math.floor(Math.min(...ys));
  const maxY = Math.ceil(Math.max(...ys));
  const dw = maxX - minX + 1;
  const dh = maxY - minY + 1;
  const out = Buffer.alloc(dw * dh * 4);
  const src = glyph.rgba;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const dx = x + minX;
      const dy = y + minY;
      const sx = dx * cos + dy * sin + cx;
      const sy = -dx * sin + dy * cos + cy;
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) continue;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const tx = sx - x0;
      const ty = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x0 + 1) * 4;
      const i01 = ((y0 + 1) * sw + x0) * 4;
      const i11 = ((y0 + 1) * sw + x0 + 1) * 4;
      const di = (y * dw + x) * 4;
      for (let c = 0; c < 4; c++) {
        out[di + c] = Math.round(
          (src[i00 + c] * (1 - tx) + src[i10 + c] * tx) * (1 - ty) +
            (src[i01 + c] * (1 - tx) + src[i11 + c] * tx) * ty
        );
      }
    }
  }
  return { rgba: out, width: dw, height: dh };
}

/**
 * @param {Buffer} rgba
 * @param {number} W
 * @param {number} H
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @param {string} text
 * @param {{ img: any, meta: any }} atlas
 * @param {{ pathMark?: string, pathPlatinum?: boolean }} [opts]
 */
function drawBandText(rgba, W, H, cx, cy, radius, text, atlas, opts = {}) {
  const pathMark = String(opts.pathMark || '')
    .trim()
    .toUpperCase();
  const pathPlatinum = Boolean(opts.pathPlatinum) && Boolean(pathMark);
  const targetPx = 62;
  const atlasH = atlas.meta.height || atlas.img.height || 139;
  const scale = targetPx / atlasH;
  const glyphs = [];
  let total = 0;
  // Track whether the current character falls inside the PATH word (SECURED|ESTABLISHED).
  const pathStart = pathMark ? text.toUpperCase().indexOf(pathMark) : -1;
  const pathEnd = pathStart >= 0 ? pathStart + pathMark.length : -1;
  let idx = 0;
  for (const ch of text) {
    const raw = sampleAtlasGlyph(atlas, ch);
    if (!raw) {
      idx += 1;
      continue;
    }
    const inPath = pathPlatinum && pathStart >= 0 && idx >= pathStart && idx < pathEnd;
    const hiRgb = inPath ? PLAT_HI : GOLD_HI;
    const loRgb = inPath ? PLAT_LO : GOLD_LO;
    const adv = raw.adv * scale;
    glyphs.push({ raw, hiRgb, loRgb, adv, scale });
    total += adv;
    idx += 1;
  }
  let track = 1;
  if (total / radius > Math.PI * 2 * 0.98) {
    track = (Math.PI * 2 * 0.98 * radius) / total;
  }
  let theta = -Math.PI / 2; // 12 o'clock, clockwise
  for (const g of glyphs) {
    const mid = theta + (g.adv * track) / (2 * radius);
    const deg = (mid * 180) / Math.PI + 90;
    // darker under-pass first (two-tone)
    const lo = tintGlyph(g.raw, g.loRgb);
    const rotLo = rotateGlyph(lo, deg);
    const tw = Math.max(1, Math.round(rotLo.width * g.scale));
    const th = Math.max(1, Math.round(rotLo.height * g.scale));
    const px = Math.round(cx + Math.cos(mid) * radius - tw / 2);
    const py = Math.round(cy + Math.sin(mid) * radius - th / 2);
    blitScaled(rgba, W, H, rotLo, px + 1, py + 1, tw, th);
    const hi = tintGlyph(g.raw, g.hiRgb);
    const rot = rotateGlyph(hi, deg);
    blitScaled(rgba, W, H, rot, px, py, tw, th);
    theta += (g.adv * track) / radius;
  }
}

/**
 * Camera-scannable QR for full-res seals only.
 * - Module field ≥ QR_PCT (14%) of canvas via integer module scale (no shrink-blit)
 * - Opaque dark backing plate + pure-white quiet zone + pure-black modules
 * - No transparency through the QR, no gold tint
 * - Bottom-right; may sit on the outer dark field but stays outside the band radius
 *
 * @returns {{ dim: number, qrDim: number, x: number, y: number, modules: number, scale: number, url: string, pad: number, pct: number }}
 */
async function drawQr(rgba, W, H, url) {
  const matrix = await QRCode.create(url, { errorCorrectionLevel: QR_ECC });
  const modules = matrix.modules;
  const size = modules.size;
  const quiet = QR_QUIET_MODULES;
  const cells = size + quiet * 2;
  // 14% is measured on DATA modules (size×scale), matching founder accept geometry.
  // Quiet zone is outside that floor — never count it toward the 14% budget.
  const shortest = Math.min(W, H);
  const targetPx = Math.round(shortest * QR_PCT);
  const scale = Math.max(1, Math.ceil(targetPx / size));
  const dataPx = size * scale; // >= 14% of shortest edge
  const modulePx = cells * scale; // data + quiet, crisp integer grid (no shrink-blit)
  const pad = Math.max(4, Math.round(scale)); // dark plate rim outside white quiet zone
  const plate = modulePx + pad * 2;

  const DARK = [11, 18, 16];
  const WHITE = [255, 255, 255];
  const BLACK = [0, 0, 0];

  const plateRgba = Buffer.alloc(plate * plate * 4, 0);
  for (let i = 0; i < plateRgba.length; i += 4) {
    plateRgba[i] = DARK[0];
    plateRgba[i + 1] = DARK[1];
    plateRgba[i + 2] = DARK[2];
    plateRgba[i + 3] = 255;
  }
  // White quiet zone + light modules.
  for (let y = 0; y < modulePx; y++) {
    for (let x = 0; x < modulePx; x++) {
      const i = ((y + pad) * plate + (x + pad)) * 4;
      plateRgba[i] = WHITE[0];
      plateRgba[i + 1] = WHITE[1];
      plateRgba[i + 2] = WHITE[2];
      plateRgba[i + 3] = 255;
    }
  }
  // Black dark modules at integer scale.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!modules.get(x, y)) continue;
      const px = (x + quiet) * scale + pad;
      const py = (y + quiet) * scale + pad;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = ((py + dy) * plate + (px + dx)) * 4;
          plateRgba[i] = BLACK[0];
          plateRgba[i + 1] = BLACK[1];
          plateRgba[i + 2] = BLACK[2];
          plateRgba[i + 3] = 255;
        }
      }
    }
  }

  const margin = Math.max(4, Math.round(W * 0.004));
  const x0 = W - plate - margin;
  const y0 = H - plate - margin;
  blitScaled(rgba, W, H, { rgba: plateRgba, width: plate, height: plate }, x0, y0, plate, plate);
  return {
    dim: plate,
    qrDim: modulePx,
    dataPx,
    x: x0,
    y: y0,
    modules: size,
    scale,
    url,
    pad,
    /** Data-module fraction of shortest edge (acceptance metric). */
    pct: dataPx / shortest,
    /** Full module field incl. quiet zone / canvas (debug). */
    fieldPct: modulePx / shortest
  };
}

function applyRevoked(rgba, W, H) {
  // Desaturation + dim applied on top of the already-brightened base (transparent pixels untouched).
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 1) continue;
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    // ~25% color retained, brightness ~70%
    rgba[i] = Math.round((r * 0.25 + gray * 0.75) * 0.7);
    rgba[i + 1] = Math.round((g * 0.25 + gray * 0.75) * 0.7);
    rgba[i + 2] = Math.round((b * 0.25 + gray * 0.75) * 0.7);
  }
  // Red REVOKED stamp rotated ~18°
  const stamp = 'REVOKED';
  // Simple block stamp via fillRect diagonal band
  const cx = W / 2;
  const cy = H / 2;
  for (let y = -60; y < 60; y++) {
    for (let x = -380; x < 380; x++) {
      const rad = (18 * Math.PI) / 180;
      const xr = x * Math.cos(rad) - y * Math.sin(rad);
      const yr = x * Math.sin(rad) + y * Math.cos(rad);
      const px = Math.round(cx + xr);
      const py = Math.round(cy + yr);
      if (Math.abs(y) > 48) continue;
      fillRect(rgba, W, H, px, py, 1, 1, 180, 35, 35, 210);
    }
  }
  // Lettering via atlas if available
  try {
    const atlas = loadAtlas();
    const scale = 1.35;
    let totalW = 0;
    const parts = [];
    for (const ch of stamp) {
      const g = sampleAtlasGlyph(atlas, ch);
      if (!g) continue;
      const tinted = tintGlyph(g, [255, 235, 230]);
      const rot = rotateGlyph(tinted, -18);
      const tw = Math.round(rot.width * scale);
      const th = Math.round(rot.height * scale);
      parts.push({ rot, tw, th });
      totalW += tw + 8;
    }
    let x = cx - totalW / 2;
    const y = cy - (parts[0] ? parts[0].th / 2 : 0);
    for (const p of parts) {
      blitScaled(rgba, W, H, p.rot, Math.round(x), Math.round(y), p.tw, p.th);
      x += p.tw + 8;
    }
  } catch {
    /* stamp bar alone is enough */
  }
}

/**
 * @param {{
 *  serial: string,
 *  ca: string,
 *  status?: string,
 *  pathFamily?: string,
 *  pathMark?: string,
 *  qualifyPath?: string,
 *  grade?: string,
 *  includeQr?: boolean
 * }} input
 * @returns {Promise<{ rgba: Buffer, width: number, height: number, serial: string, qr?: object|null }>}
 */
async function paintOfficialSeal(input) {
  const serial = String(input.serial || '').trim().toUpperCase();
  const ca = String(input.ca || '').trim();
  const status = String(input.status || 'VALID').toUpperCase();
  const grade = String(input.grade || '').trim().toUpperCase();
  const includeQr = input.includeQr !== false;
  const mark = String(
    input.pathMark ||
      (String(input.pathFamily || '').toLowerCase() === 'established'
        ? 'ESTABLISHED'
        : String(input.pathFamily || '').toLowerCase() === 'secured' ||
            String(input.qualifyPath || '').toLowerCase() === 'lifetime' ||
            String(input.qualifyPath || '').toLowerCase() === 'timed'
          ? 'SECURED'
          : '')
  )
    .trim()
    .toUpperCase();
  const W = SEAL_CANVAS;
  const H = SEAL_CANVAS;
  // Transparent plate — medallion + band (+ optional QR). QR plate itself is fully opaque.
  const rgba = Buffer.alloc(W * H * 4, 0);

  const med = brightenTrophyGold(loadMedallion());
  const target = GUIDE_INNER * 2 - 8;
  const dx = Math.round((W - target) / 2);
  const dy = Math.round((H - target) / 2);
  blitScaled(rgba, W, H, med, dx, dy, target, target);

  const cx = W / 2;
  const cy = H / 2;
  drawGuideRing(rgba, W, H, cx, cy, GUIDE_INNER, GOLD_LO[0], GOLD_LO[1], GOLD_LO[2], 160);
  drawGuideRing(rgba, W, H, cx, cy, GUIDE_OUTER, GOLD_LO[0], GOLD_LO[1], GOLD_LO[2], 160);

  const atlas = loadAtlas();
  // Band: ✦ {serial} ✦ {PATH} ✦ {ca}  — PATH ∈ SECURED | ESTABLISHED
  // AA tokens: path word only in platinum; rings / medallion / serial / CA stay gold.
  const band = mark ? `✦ ${serial} ✦ ${mark} ✦ ${ca} ` : `✦ ${serial} ✦ ${ca} `;
  drawBandText(rgba, W, H, cx, cy, BAND_R, band, atlas, {
    pathMark: mark,
    pathPlatinum: grade === 'AA'
  });

  let qr = null;
  if (includeQr) {
    // Full-res only. Tiny/OG variants omit QR — an unscannable decorative code is worse than none.
    qr = await drawQr(rgba, W, H, sealVerifyUrl(serial));
    // Guard: QR plate top-left must sit outside the engraved band (with small slack).
    const nearestR = Math.hypot(cx - qr.x, cy - qr.y);
    if (nearestR < BAND_R) {
      throw new Error(
        `seal QR overlaps band text (nearestR=${nearestR.toFixed(1)} band=${BAND_R})`
      );
    }
  }

  if (status === 'REVOKED') applyRevoked(rgba, W, H);

  return { rgba, width: W, height: H, serial, qr };
}

/**
 * Zero RGB on near-transparent pixels — smaller deflate + cleaner edges on dark UIs.
 * @param {Buffer} rgba
 */
function crushTransparent(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 8) {
      rgba[i] = 0;
      rgba[i + 1] = 0;
      rgba[i + 2] = 0;
      rgba[i + 3] = 0;
    }
  }
}

/**
 * @param {{ serial: string, ca: string, status?: string, pathFamily?: string, pathMark?: string, qualifyPath?: string, grade?: string }} input
 * @returns {Promise<Buffer>} PNG 1800×1800 RGBA (transparent plate)
 */
export async function renderOfficialSeal(input) {
  // Default QR on; pass includeQr:false for embeds too small to scan (verify OG card, etc.).
  const painted = await paintOfficialSeal({
    ...input,
    includeQr: input?.includeQr !== false
  });
  crushTransparent(painted.rgba);
  // RGBA PNG with transparent corners (not opaque RGB).
  return encodePng(painted.rgba, painted.width, painted.height);
}

/**
 * Compressed OG variant — ~1024×1024 indexed PNG (target under 300KB).
 * Full-res remains at /api/seal/&lt;serial&gt;.png.
 * QR is omitted: at OG/display sizes the code is too small for phones and a
 * decorative non-scanning QR is worse than none. Use the full-res seal to scan.
 * Note: indexed OG flattens alpha to opaque black — do NOT use for on-page UI.
 * @param {{ serial: string, ca: string, status?: string, pathFamily?: string, pathMark?: string, qualifyPath?: string, grade?: string }} input
 * @returns {Promise<Buffer>}
 */
export async function renderOfficialSealOg(input) {
  const painted = await paintOfficialSeal({ ...input, includeQr: false });
  return encodeOgPng(painted.rgba, painted.width, painted.height, {
    size: SEAL_OG_SIZE,
    colors: SEAL_OG_COLORS
  });
}

/**
 * On-page UI seal — ~256×256 RGBA with real transparency (floats on page bg).
 * No QR (escape clause: tiny variants omit rather than ship decorative codes).
 * Use this for verify page / scan report — not the indexed OG (black field).
 * @param {{ serial: string, ca: string, status?: string, pathFamily?: string, pathMark?: string, qualifyPath?: string, grade?: string }} input
 * @returns {Promise<Buffer>}
 */
export async function renderOfficialSealUi(input) {
  const painted = await paintOfficialSeal({ ...input, includeQr: false });
  crushTransparent(painted.rgba);
  const size = SEAL_UI_SIZE;
  const small = downscaleRgba(painted.rgba, painted.width, painted.height, size, size);
  crushTransparent(small);
  return encodePng(small, size, size);
}

/**
 * Debug/test helper — paint full-res seal and return QR metrics + PNG.
 * @param {Parameters<typeof paintOfficialSeal>[0]} input
 */
export async function renderOfficialSealWithMeta(input) {
  const painted = await paintOfficialSeal({ ...input, includeQr: true });
  crushTransparent(painted.rgba);
  return {
    png: encodePng(painted.rgba, painted.width, painted.height),
    qr: painted.qr,
    width: painted.width,
    height: painted.height,
    serial: painted.serial
  };
}

export function renderMissingSealPng() {
  const W = 640;
  const H = 640;
  const rgba = Buffer.alloc(W * H * 4, 0);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 12;
    rgba[i + 1] = 14;
    rgba[i + 2] = 16;
    rgba[i + 3] = 255;
  }
  // ring
  drawGuideRing(rgba, W, H, 320, 320, 280, 80, 80, 80, 255);
  // text via crude fill — "NO SUCH SEAL"
  const msg = 'NO SUCH SEAL';
  try {
    const atlas = loadAtlas();
    const scale = 0.42;
    let totalW = 0;
    const parts = [];
    for (const ch of msg) {
      const g = sampleAtlasGlyph(atlas, ch === ' ' ? ' ' : ch);
      if (!g) {
        totalW += 18;
        parts.push(null);
        continue;
      }
      const tinted = tintGlyph(g, [160, 160, 160]);
      const tw = Math.round(tinted.width * scale);
      const th = Math.round(tinted.height * scale);
      parts.push({ tinted, tw, th });
      totalW += tw + 4;
    }
    let x = Math.round((W - totalW) / 2);
    for (const p of parts) {
      if (!p) {
        x += 18;
        continue;
      }
      blitScaled(rgba, W, H, p.tinted, x, Math.round((H - p.th) / 2), p.tw, p.th);
      x += p.tw + 4;
    }
  } catch {
    fillRect(rgba, W, H, 120, 300, 400, 40, 160, 160, 160, 255);
  }
  return encodePngRgb(rgba, W, H, true);
}
