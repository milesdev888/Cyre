# B402 / BSC lane — Vercel env vars (values from owner — never commit secrets)

Lane code is **already on `main`** (merged via PR #118). It stays **dormant** until `X402_PAY_TO_BSC` is set. Base and Solana lanes unchanged byte-for-byte when unset.

B402 **secrets live on Render** (`cyre-fraud-prediction` relay). Vercel only talks to the relay with `X402_INTERNAL_KEY` (same value as Render `GUARDIAN_KEY`).

Companion relay: https://github.com/milesdev888/cyre-fraud-prediction (see `docs/B402-RELAY.md`).

## Vercel (Guardian / cyre.dev)

| Env | Purpose |
|---|---|
| `X402_PAY_TO_BSC` | Merchant treasury `0x…` on BNB Chain (**arms the lane** — leave unset until Sandbox credentials + Render B402 env are live) |
| `X402_FACILITATOR_BSC` | Relay base URL — default `https://cyre-fraud-prediction.onrender.com/internal/b402` |
| `X402_INTERNAL_KEY` | Already set — auth to `/internal/b402/*` (must match Render `GUARDIAN_KEY`) |

### Optional

| Env | Default | Purpose |
|---|---|---|
| `X402_NETWORK_BSC` | `mainnet` | `mainnet` → `eip155:56` · `testnet` → `eip155:97` |
| `X402_ASSET_BSC` | `USDT` | `USDT` or `USDC` |
| `B402_SIGNER_ADDRESS` | — | Fallback `extra.signerAddress` if relay `/supported` fails |
| `B402_SPENDER_ADDRESS` | — | Fallback `extra.spenderAddress` if relay `/supported` fails |
| `X402_ASSET_BSC_NAME` / `X402_ASSET_BSC_VERSION` / `X402_BSC_TRANSFER_METHOD` | from asset / `permit2-exact` | Only used with signer/spender fallbacks |

If `/supported` is unreachable **and** signer/spender fallbacks are unset, the BSC entry is **omitted** from `accepts[]` (Base/Solana unchanged). Never advertise a guessed `extra`.

## Render (relay — secrets)

| Env | Purpose |
|---|---|
| `B402_BASE_URL` | Binance authenticated `{BASE_URL}` |
| `B402_CLIENT_ID` | Partner `clientId` |
| `B402_ACCESS_TOKEN` | Partner `accessToken` |
| `B402_RSA_PRIVATE_KEY` | PKCS#8 DER Base64 (from `node scripts/b402-keygen.js` in fraud-prediction) |
| `GUARDIAN_KEY` | Already set |

Exact names + activation runbook: fraud-prediction `docs/B402-RELAY.md`.

## Owner checklist (same-day activation — no code merge needed)

1. Generate RSA on your machine: `node scripts/b402-keygen.js` (fraud-prediction repo). **Do not run in CI.**
2. Apply Sandbox/Prod: https://forms.gle/aUQvxUETfGMzyTky5 — submit **public** key + Render **static outbound IPs**.
3. Enable Dedicated IPs: Dashboard → **Networking → Dedicated IPs**; copy from service **Connect → Outbound**.
4. Set Render `B402_*` env vars (per-key only — never bulk-replace).
5. Set Vercel `X402_PAY_TO_BSC` (+ optional network/asset). **Do not set this until step 4 succeeds.**
6. Confirm `$0.005` offers show BSC `amount` as `5000000000000000` when the lane is armed.

See `docs/B402-RESEARCH.md` for Part 1 research.
