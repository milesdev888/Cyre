# Phase 1 — Scanner data layer (guardian-scan)

## Delivery note
This agent can push to `milesdev888/-Cyre-Guardian` but **cannot push** to
`milesdev888/guardian-scan` (token has no write permission). Phase 1 code is
committed locally on `cursor/scanner-data-layer-354a` inside `guardian-scan/`
and exported as:

- `patches/guardian-scan-phase1-scanner-data-layer.diff`
- `patches/guardian-scan-phase1-scanner-data-layer.patch`

Apply on a machine with write access:

```bash
cd guardian-scan
git checkout -b cursor/scanner-data-layer-354a
git apply ../patches/guardian-scan-phase1-scanner-data-layer.diff
# or: git am < ../patches/guardian-scan-phase1-scanner-data-layer.patch
git push -u origin cursor/scanner-data-layer-354a
```

## Live acceptance (2026-09-06)

Mint `979sitxCjWFPdAsrF2ybKNENwFcpiHDwaAasC5Xa5qww` (C7 / CYRE)

| Check | Result |
|---|---|
| LP tier | **PERMANENT** (meteora_damm_v2, live pool-owner read) |
| Free-float concentration | Vault labeled `Meteora pool vault` (11.2%) excluded; free-float top ≈ 88% |
| Deployer | Resolved on-chain (`PQMPayrK…`) when RugCheck omits creator |
| Same-ticker copies | **4** other C7 mints via Dex+Jupiter+Gecko (public index depth; **blocker vs ≥6**) |
| Chain label | `Solana` only (no `Solana · solana`) |
| Score gauge | Shared `GradeMark` + `score/100` for Solana and EVM |

Controls:

- USDC (`EPjF…Dt1v`): mint authority live → harsh grade expected; deployer resolved; 16 copycats
- SILLY (`7EYn…awMs`): Raydium vault labeled; LP **UNVERIFIED** (unknown locker) — sensible for unlocked/opaque LP

## Blockers
1. **Cannot open PR on guardian-scan** — no push permission for this agent token.
2. **C7 copycat count = 4 (< 6)** — DexScreener + Jupiter + GeckoTerminal only surface 4–5 exact `C7` mints publicly; no hardcoding.

## Out of scope (later phases)
Badge Secured/Established paths, BNB/Polygon/etc., x402/C7 burn checkout.
