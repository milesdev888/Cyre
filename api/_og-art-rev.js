// api/_og-art-rev.js — cache-bust query for og:image / twitter:image URLs.
// Bump OG_ART_REV whenever seal or share-card art changes materially so
// X / Telegram unfurl caches refetch (they key on the full image URL).

/** @type {string} Seal brightening + card art revision. Bump on material art changes. */
export const OG_ART_REV = '4';

/**
 * Append or replace `r=<OG_ART_REV>` on an absolute or root-relative image URL.
 * @param {string} url
 * @returns {string}
 */
export function withOgArtRev(url) {
  const s = String(url || '').trim();
  if (!s) return s;
  try {
    const u = new URL(s, 'https://cyre.dev');
    u.searchParams.set('r', OG_ART_REV);
    // Preserve relative inputs as relative
    if (/^https?:\/\//i.test(s)) return u.toString();
    return u.pathname + u.search + u.hash;
  } catch (_) {
    const join = s.includes('?') ? '&' : '?';
    // strip existing r=
    const cleaned = s.replace(/([?&])r=[^&]*/g, '$1').replace(/[?&]$/, '');
    const j = cleaned.includes('?') ? '&' : '?';
    return `${cleaned}${j}r=${OG_ART_REV}`;
  }
}
