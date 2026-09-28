# $C7 Mainnet Launch Runbook

**Files only were prepared for this kit — no mainnet (or any cluster) commands were executed by the agent.**  
**Rehearsal (PASS):** [`docs/C7-REHEARSAL-REPORT.md`](./C7-REHEARSAL-REPORT.md) · config baseline [`docs/c7_dbc_config.devnet.jsonc`](./c7_dbc_config.devnet.jsonc) (PR #122)  
**Mainnet config:** [`docs/c7_dbc_config.mainnet.jsonc`](./c7_dbc_config.mainnet.jsonc)  
**Toolkit:** [MeteoraAg/meteora-invent](https://github.com/MeteoraAg/meteora-invent) (same actions as the 2026-08-31 rehearsal)

Caps tonight: **initialMarketCap 25 SOL · migrationMarketCap 300 SOL**. Allocation math unchanged (100M supply · 65M leftover · 10M vest · 100% creator permanent LP lock).

---

## 1. Preflight checklist (Windows)

Do every line before the first `pnpm` action:

- [ ] Open `docs/c7_dbc_config.mainnet.jsonc` and fill:
  - `<DEPLOY_KEYPAIR_PATH>` → absolute path to the **deploy** keypair JSON on this PC  
  - `<TREASURY_WALLET>` → base58 pubkey that receives **65,000,000 $C7** (founder-controlled; double-check)  
  - `<DEPLOY_WALLET>` → base58 pubkey of that same deploy keypair (for `feeClaimer` + `dbcPool.creator`)
- [ ] Confirm `rpcUrl` is **mainnet** (`https://api.mainnet-beta.solana.com` or your Helius mainnet URL with a real key — never commit the key).
- [ ] `dryRun` is `false` only when you intend to send real txs (optional: set `true` once first to simulate create-config).
- [ ] Solana CLI on mainnet-beta:

```bat
solana config set --url https://api.mainnet-beta.solana.com
solana config set --keypair <DEPLOY_KEYPAIR_PATH>
solana config get
solana balance
```

- [ ] **Fund the deploy wallet — ESTIMATE (from devnet spend, fees do not scale with mcap):**  
  Devnet rehearsal (0.1→0.5 caps) spent ~**0.033 SOL** on create-config + create-pool (balance 0.999 → 0.966 before any swap) and **0.01 SOL** on the first curve buy (`dbcSwap.amountIn`).  
  **ESTIMATE for tonight’s create-config + create-pool + first seed buy: ≥ 0.15 SOL** on the deploy wallet (covers rent, CU tips, and the 0.01 seed with headroom).  
  This does **not** include buying the curve up to migration (~300 SOL mcap territory — market/other wallets, not a deploy-wallet obligation at the STOP-POINT).
- [ ] Clone/pull meteora-invent; from its root:

```bat
pnpm install
```

- [ ] Copy the filled mainnet config over Invent’s studio config (Invent reads `studio/config/dbc_config.jsonc` by default):

```bat
copy /Y path\to\-Cyre-Guardian\docs\c7_dbc_config.mainnet.jsonc path\to\meteora-invent\studio\config\dbc_config.jsonc
```

- [ ] Ensure the deploy keypair file is reachable at the path you put in `keypairFilePath` (or place a copy as `studio\keypair.json` and set `"keypairFilePath": "./keypair.json"`).

---

## 2. Exact command sequence (mirrors rehearsal)

Work from `meteora-invent\studio` (PowerShell or cmd). Same actions as the PASS rehearsal.

### 2a. Create DBC config (on-chain)

```bat
cd path\to\meteora-invent\studio
pnpm dbc-create-config
```

Record from the log:

- **Config public key** (rehearsal example shape: printed as `>>> Config public key: …`)
- **Create-config tx signature**

Explorer (mainnet — no `cluster=devnet`):  
`https://explorer.solana.com/tx/<CONFIG_TX>`

### 2b. Create pool (this mints $C7)

```bat
pnpm dbc-create-pool --config <CONFIG_PUBLIC_KEY>
```

Record from the log:

- **Base token mint** (`- Using base token mint …`)
- **Create-pool tx signature**

Optional status read (same as rehearsal):

```bat
pnpm dbc-get-status --baseMint <MINT>
```

---

## 3. STOP-POINT — verify before any announcement

**After create-pool there is no undo.** This verify is the last clean exit before the CA is public.

1. Record the **mint address**.
2. On [explorer.solana.com](https://explorer.solana.com) (mainnet):

```bat
spl-token display <MINT>
```

Confirm:

| Check | Required |
|---|---|
| Supply | **100,000,000** (6 decimals → raw `100000000000000`) |
| Mint authority | **(not set)** |
| Freeze authority | **(not set)** |

3. Only then publish the CA — **and only** on:
   - `https://cyre.dev/tokenomics`
   - `@Cyredev888`

Do **not** announce from Discord randoms, Telegram forwards, or third-party “CA drop” bots first.

---

## 4. What NOT to do

- No swaps from the deploy wallet beyond the **planned seed buy** (`dbcSwap.amountIn`, currently **0.01** SOL in the mainnet config). Do not try to graduate the 300 SOL mcap curve from the deploy key.
- Never paste the private key / seed phrase into chat, Discord, Cursor, Notion, or screenshots.
- Never commit `<DEPLOY_KEYPAIR_PATH>` contents or a real Helius key into git.
- Do not point this config at **devnet** by mistake (`solana config get` / `rpcUrl` check twice).
- Do not treat leftover as “in treasury” until **after** a later `withdrawLeftover` (BUILD path — no studio CLI; see rehearsal report). That step is **post-migration**, not part of the create-pool STOP-POINT.

---

## 5. Post-launch verification (a–e)

Same checks as the rehearsal; use **mainnet** explorer links (no `?cluster=devnet`).

Fill in after you have mint / pool / txs:

| # | Check | How | Result |
|---|---|---|---|
| a | Mint; mint + freeze authority null | `spl-token display <MINT>` · [explorer mint](https://explorer.solana.com/address/<MINT>) | ☐ |
| b | Leftover 65,000,000 to `<TREASURY_WALLET>` | After migration + `withdrawLeftover`: `spl-token balance <MINT> --owner <TREASURY_WALLET>` (if treasury ≠ deploy buyer, expect **exactly 65M**; if same wallet also bought the curve, subtract buys) · [tx](https://explorer.solana.com/tx/<WITHDRAW_LEFTOVER_TX>) | ☐ |
| c | Vesting escrow holds 10,000,000 + 6‑mo cliff / daily | Escrow ATA balance 10M; on-chain `cliffDurationFromMigrationTime=15552000`, daily frequency · [escrow](https://explorer.solana.com/address/<ESCROW>) | ☐ |
| d | LP permanently locked (100% creator) | Migrate logs `PermanentLockPosition`; `isPermanentLockedPosition=true` · [position](https://explorer.solana.com/address/<LP_POSITION>) | ☐ |
| e | curve-sold + leftover + vesting ≈ 100,000,000 | Sum largest holders / bucket table like the rehearsal report | ☐ |

Later actions (only when the curve has actually graduated — **not** required to publish the CA):

```bat
pnpm dbc-swap --baseMint <MINT>
pnpm dbc-migrate-to-damm-v2 --baseMint <MINT>
```

Then run SDK `withdrawLeftover` (see rehearsal) so treasury receives the 65M.

---

## 6. Rollback reality

| Stage | Reversible? |
|---|---|
| Edit local JSON only | Yes |
| `dryRun: true` simulation | Yes (no chain state) |
| **create-config** landed | Config account exists; you can abandon and create another config — unused config is wasted rent, not a token |
| **create-pool** landed | **No undo.** Mint is live, authorities already immutable per config. STOP-POINT verify is the last exit before publishing the CA. |
| After public CA | Assume permanent |

---

## Quick reference — rehearsal command map

| Step | Command used on PASS rehearsal |
|---|---|
| Create config | `pnpm dbc-create-config` |
| Create pool | `pnpm dbc-create-pool --config <CONFIG>` |
| Status | `pnpm dbc-get-status --baseMint <MINT>` |
| Swap | `pnpm dbc-swap --baseMint <MINT>` |
| Migrate | `pnpm dbc-migrate-to-damm-v2 --baseMint <MINT>` |
| Leftover | SDK `client.migration.withdrawLeftover` (no studio script) |
