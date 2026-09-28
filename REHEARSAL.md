# $C7 DEVNET REHEARSAL — STEP BY STEP

Goal: run the ENTIRE launch on **devnet** with fake SOL, graduate the pool,
and verify the **65M leftover** lands in your wallet. Nothing here touches
mainnet or real money.

Do it at the computer. Copy-paste each command exactly. Screenshot errors —
do not improvise.

Config file in this repo: `cyre_dbc_config.devnet.jsonc`
(tiny 2-SOL graduation so faucet SOL can finish the curve).

---

## STEP 1 — Install tools (once)

```
npm install -g pnpm
```

```
git clone https://github.com/MeteoraAg/meteora-invent.git
```

```
cd meteora-invent
```

```
pnpm install
```

---

## STEP 2 — Install Solana CLI (once)

Mac:
```
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
```

Windows (PowerShell as Administrator):
```
cmd /c "curl https://release.anza.xyz/stable/install-init-x86_64-pc-windows-msvc.exe --output C:\solana-install.exe --create-dirs && C:\solana-install.exe"
```

Close and reopen the terminal after install.

---

## STEP 3 — Create the devnet wallet

```
cd studio
```

```
solana-keygen new --outfile ./keypair.json --no-bip39-passphrase
```

It prints a line starting with `pubkey:` — **copy that address.**
This is your throwaway devnet wallet. Never send real funds to it.

---

## STEP 4 — Get free devnet SOL

```
solana airdrop 5 YOUR_PUBKEY --url devnet
```

Replace `YOUR_PUBKEY` with the address from step 3.
Run a few times if needed, or use https://faucet.solana.com.
Target ~5 SOL:

```
solana balance YOUR_PUBKEY --url devnet
```

---

## STEP 5 — Drop in the CYRE config

1. Copy `cyre_dbc_config.devnet.jsonc` from this repo into `studio/config/`.
2. Rename it to `dbc_config.jsonc` (replace the template).
3. Replace **all three** `PASTE_YOUR_DEVNET_WALLET_PUBKEY` values with your step-3 address. Save.

---

## STEP 6 — Dry run the config (simulation only)

```
pnpm studio dbc-create-config
```

`dryRun` is true, so this only SIMULATES. Read the output.
If clean, set `"dryRun": false`, save, and run the same command again
to create the config on-chain.

**Screenshot the output.**

---

## STEP 7 — Create the pool (mints C7 on devnet)

```
pnpm studio dbc-create-pool
```

Mints the token (name CYRE, symbol C7) and opens the bonding curve.
**Screenshot pool + mint addresses.**

---

## STEP 8 — Buy through the curve until it graduates

Devnet config graduates at **2 SOL** so faucet SOL can finish it.
Run repeatedly:

```
pnpm studio dbc-swap
```

Between runs:

```
pnpm studio dbc-get-status
```

Keep swapping until the threshold is reached.

---

## STEP 9 — Migrate (graduation)

```
pnpm studio dbc-migrate-to-damm-v2
```

Verify against cyre.dev/tokenomics claims:

1. **Leftover:** 65,000,000 C7 arrived at your wallet  
   https://explorer.solana.com/?cluster=devnet — paste your pubkey
2. **LP locked:** DAMM v2 position shows 100% permanently locked
3. **Team vest:** 10M in vesting escrow (cliff timer running)

**Screenshot explorer + CLI output.**

---

## IF ANYTHING ERRORS

Stop. Screenshot the full error. Send it back. Do not improvise —
that's the point of rehearsing on devnet.

---

## WHAT THIS PROVES

If all 9 steps pass, mainnet launch is the same flow with
`cyre_dbc_config.jsonc` (real caps) — a script you have already run once.

---

## LOCAL VALIDATOR SHORTCUT (agent-tested)

Public Devnet faucets often rate-limit automation. A full math rehearsal was
completed on `solana-test-validator` with Meteora BPF programs — see
**`REHEARSAL_RESULTS.md`** (PASS: 65M leftover claimed, 10M vest escrow,
100% permanent LP lock config, immutable mint).

Extra steps that rehearsal found:

1. Prefer `"metadata": { "uri": "https://cyre.dev/token-metadata.json" }` over Irys upload.
2. After migrate, call SDK `migration.withdrawLeftover` — leftover is not auto-credited.
3. Near graduation, shrink `dbcSwap.amountIn` if you see `Insufficient Liquidity`.
4. On localnet only: fund the DBC pool authority PDA (~0.1 SOL) before migrate.
