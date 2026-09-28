# C7 cobra assets — CANONICAL (do not overwrite)

`c7-cobra-512.png` and `c7-cobra-256.png` (plus `c7-cobra-icon-512.png`) are the
**canonical $C7 token mark** (black square field). They are referenced by:

- on-chain Metaplex metadata → `https://cyre.dev/token-metadata.json` → `image`
- Jupiter / swap `logoUri`, agent `iconUrl`, favicons / apple-touch icons
- wallets and aggregators (black field reads correctly in circular crops)

## On-site transparent crest

`c7-cobra-512-transparent.png` and `c7-cobra-256-transparent.png` are the same
gold cobra + C7 monogram + engraved ring with the black field masked out.
Use these for UI placements (hero, nav orb, chat FAB, app sidebar). Regenerate
with:

```bash
python3 scripts/make_c7_cobra_transparent.py
```

## Required look

Bright **metallic gold** cobra with the **C7 monogram in the coils**, black
square field on the canonical token files, built-in gold ring — same snake as
the X avatar `@Cyredev888`.

Verify before any deploy (center lit pixels must be warm gold):

```bash
python3 scripts/verify_c7_cobra_gold.py
```

Expect: top-quartile center RGB with **R > 150**, **R > G > B**.

## NEVER

- Do **not** overwrite `c7-cobra-*.png` with the olive/green hero snake (no monogram).
- That olive asset lives only at `brand/hero-cobra-olive.png` (archive from the
  mislabeled PR #171 binary). It must **never** be copied onto `c7-cobra-*` paths.
- Do not point token metadata / Jupiter `logoUri` at the transparent files —
  keep the black-field canonical URLs for wallets and aggregators.

## Cache

Paths are CDN-cached. After replacing bytes, bump `?v=` on HTML/CSS/JSON refs
and keep `Cache-Control` on `/c7-cobra-*.png` as `must-revalidate` (never
`immutable` for these files).
