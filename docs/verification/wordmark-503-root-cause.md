# Wordmark 503 — root cause & fix

## Live symptom
`GET https://cyre.dev/brand/guardian-wordmark.jpg` → **503**  
Body: `brand asset unavailable — use text fallback`

## Root cause
1. `vercel.json` rewrites `/brand/guardian-wordmark.jpg` (and @2x / og / banners) → `/api/brand-asset?file=…`.
2. `api/brand-asset.js` had an **empty** `BRAND_ASSETS` map after incomplete `api/_brand_*` chunk imports crashed the function (`FUNCTION_INVOCATION_FAILED`).
3. Empty map → intentional 503 so the homepage text lockup (`.hero-lockup`) stays visible instead of a blank hero.
4. Most historical chunk modules were **never committed**; remaining `_brand_wordmark_*` / `_brand_banner_*` files are truncated (no full SOI…EOI JPEG).

Hero text fallback was therefore correct behavior for a broken asset pipeline — not the primary defect. The **503 from the empty brand handler** is the root cause still live on production until this fix deploys.

## Double-wordmark risk
`index.html` only handled `onerror` (hide broken img). There was **no `onload` path** to hide `.hero-lockup`. Once the JPEG returns 200, both gold text and the image would show → double wordmark.

## Fix (this PR)
1. Embed complete JPEG payloads (SOI…EOI) for wordmark 1x/2x, OG, and X banners in `api/brand-asset.js`; keep static copies under `brand/` for source of truth.
2. On img `onload`, add `.has-image` to `.hero-wordmark` and visually hide `.hero-lockup` (h1 remains for a11y). On `onerror`, remove `.has-image` and keep the text lockup.
