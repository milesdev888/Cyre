# OG art cache bust

X and Telegram cache unfurl images by **exact URL**. When seal or share-card
pixels change, bump the revision so meta tags point at a new URL.

## Bump procedure

1. Edit `OG_ART_REV` in:
   - `api/_og-art-rev.js` (cyre.dev)
   - `guardian-scan/lib/og-art-rev.ts` (scan.cyre.dev)
2. Keep both in sync (same string, e.g. `2` → `3`).
3. Redeploy both apps.

Static HTML site cards use `?r=<rev>` on
`https://cyre.dev/brand/guardian-og-1200x630.jpg` — mass-updated with the same
rev when you bump.

Current rev: **`2`** (seal brightening).
