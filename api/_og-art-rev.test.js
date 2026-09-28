// api/_og-art-rev.test.js
import { OG_ART_REV, withOgArtRev } from './_og-art-rev.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

assert(OG_ART_REV === '4', 'rev is 4 for seal QR 14%');
assert(
  withOgArtRev('https://cyre.dev/api/seal/GRD-2026-00001/og.png') ===
    `https://cyre.dev/api/seal/GRD-2026-00001/og.png?r=${OG_ART_REV}`,
  'absolute seal'
);
assert(
  withOgArtRev('https://cyre.dev/brand/guardian-og-1200x630.jpg') ===
    `https://cyre.dev/brand/guardian-og-1200x630.jpg?r=${OG_ART_REV}`,
  'site og'
);
assert(
  withOgArtRev('https://scan.cyre.dev/api/card/abc/og.png') ===
    `https://scan.cyre.dev/api/card/abc/og.png?r=${OG_ART_REV}`,
  'scan card'
);
assert(
  withOgArtRev('https://cyre.dev/api/badge/og?serial=GRD-2026-00001&v=5') ===
    `https://cyre.dev/api/badge/og?serial=GRD-2026-00001&v=5&r=${OG_ART_REV}`,
  'preserves other query params'
);
assert(
  withOgArtRev('/api/seal/X/og.png') === `/api/seal/X/og.png?r=${OG_ART_REV}`,
  'relative'
);
// idempotent bump
assert(
  withOgArtRev(`https://cyre.dev/api/seal/X/og.png?r=1`) ===
    `https://cyre.dev/api/seal/X/og.png?r=${OG_ART_REV}`,
  'replaces old r'
);

console.log('ok og-art-rev');
