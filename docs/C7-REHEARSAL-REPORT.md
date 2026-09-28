# $C7 Devnet Rehearsal Report

**Date:** 2026-08-31  
**Cluster:** Solana **devnet only** (genesis `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG`)  
**Toolkit:** [MeteoraAg/meteora-invent](https://github.com/MeteoraAg/meteora-invent) `@ 6787734`  
**Config:** [`docs/c7_dbc_config.devnet.jsonc`](./c7_dbc_config.devnet.jsonc)  
**Outcome:** **PASS** (end-to-end on public/Helius **devnet**)

---

## Keypairs generated this session

| # | Path (VM only, not committed) | Pubkey | Helius balance at inventory |
|---|---|---|---|
| 1 | `/tmp/c7-rehearsal/keypair.json` | `HjNv2uk5ePX9FMHFQ2tyeYaphKU3WKCnPozuYcxYC76X` | **0.999 SOL** after public-RPC airdrop retry (used as rehearsal wallet) |
| 2 | `/tmp/c7-rehearsal/keypair2.json` | `GYx9TxsWz8wmKAJZgGJg8vSwgFThxg8UfYRv6mfE7nfJ` | 0 SOL (unused) |

No other session keypairs. Private keys / seed phrases: **not committed, not printed here.**

Funding path: public `api.devnet.solana.com` `solana airdrop 1` retry loop (~17 min) eventually credited wallet #1; Helius used as RPC for the rest of the rehearsal (devnet genesis verified). Caps shrunk to **initialMarketCap 0.1 / migrationMarketCap 0.5**.

---

## Addresses

| Item | Value |
|---|---|
| Wallet / leftoverReceiver / creator / feeClaimer | `HjNv2uk5ePX9FMHFQ2tyeYaphKU3WKCnPozuYcxYC76X` |
| DBC config | `9JWSSCZjNhwBzBLoWU9EndKSvdPDfXbNCUAKDCmancAA` |
| Token mint (C7) | `BcJMFwHKgxckrbsjxiQGCH6FhKa2MK5k1jh3MUNtv7s8` |
| DBC pool | `7JcsCLHF9p9GHuAZD88fSB4MNXCrtcM6BCbScYq5SZwC` |
| Vesting escrow | `DnfbVH7J4DT8mVfcuAGyf4qyN39XVZvavUZVbnZ3F4pn` |
| Escrow ATA (10M C7) | `2eWEdvZa1kV3oSSixFhvRaRammdKuP4vsHj9Qgn7aZxt` |
| DAMM v2 pool | `CeCLPV1pcUhYwgzKkvuuRRygU7vTamR6FfvtbFNQzxe2` |
| LP position (permanent lock) | `5cwYaNWkyr2XDWHR4GEBL9kPpeahadjEhj5tkB463pD5` |

Explorer prefix: `https://explorer.solana.com/<SIG_OR_ADDR>?cluster=devnet`

---

## Transaction signatures

| Step | Signature |
|---|---|
| Create config | [`2vAqTdF…hUeD`](https://explorer.solana.com/tx/2vAqTdFhrJvrBrg8oPERfY8R8Txi19NVk3PU1fNrzXmxHVMHKJQmmffoKpcp2WWun1N5tcS6tUn499Kc3Pw6hUeD?cluster=devnet) |
| Create pool (mint) | [`41ZVojc…W8no`](https://explorer.solana.com/tx/41ZVojcQhWK9WYVJBEqf693M8GWr5xbNamihZF394JQCtZ7skzvugg9tUp29DhZq4k7btbu87UTsAfB9KRZbW8no?cluster=devnet) |
| Swap (sample — first 0.01) | [`ZfZo4Gh…cXr`](https://explorer.solana.com/tx/ZfZo4Ghgy3wjEsKSszxkb4JLVwquE3S227R5UjxpTssu9XJ17cLYAtQ6pUMBtjcaVTZiVozj4J87aVAKi4HZcXr?cluster=devnet) |
| Swap (crossing threshold, 8e-8 SOL) | [`3tsc36r…2Vxr`](https://explorer.solana.com/tx/3tsc36rAYPgayQv2jQw4bUiXJB74tL8DkhUdmUnjNYfV2aiTBmUECgyuRmhPguRUHerhZy9nLDgNT9swKv6G2Vxr?cluster=devnet) |
| Create locker (team vest) | [`5GJTGZh…vFWs`](https://explorer.solana.com/tx/5GJTGZhjeVX6uo4vQppBEiE2nZLVj3kmAexGXRG6cwvx9b2f6PX3VNewaoAi9YW4HGaf1HZKSepVAnrK1zoZvFWs?cluster=devnet) |
| Migrate → DAMM v2 (+ PermanentLockPosition) | [`2ogRX3i…8h5h`](https://explorer.solana.com/tx/2ogRX3ifUwVUCP8zBCXiGMAaqEsg7YzgXoWWNHwAjFmpkQ2tYmmMa4VWxnkSD6d8botJBzizBAJsVZrYZ6xT8h5h?cluster=devnet) |
| withdrawLeftover | [`52ZxrEv…iKaS`](https://explorer.solana.com/tx/52ZxrEvqZg4guVa9236sQs4wBpoLW6toEZthWNDoGoUxqyWh3i3kyi781nHik2Z4zkCjsf2db9zgsGGEURWFiKaS?cluster=devnet) |

Additional curve buys (shrinking sizes to avoid `Insufficient Liquidity` near the tip):  
`4BfJUa4…`, `3iyG7De…`, `2VFEdRc…`, `qztCwtK…`, `2M6BYSw…`, `i88ddvS…`, `4qUJRx3…`, `R22sJTY…`, `611u6s8…`, `5nvuVPi…`, `63pJkH9…`, `GwNkihX…`, plus micro-finish swaps. Full list in agent logs under `/tmp/c7-rehearsal/`.

Derived migration quote threshold for these caps: **38,627,124 lamports (~0.0386 SOL)** — market-cap mode ≠ 1:1 with `migrationMarketCap` SOL spent.

---

## Checklist (step 6)

| # | Check | Result | Evidence |
|---|---|---|---|
| a | Mint; mint + freeze authority null | **PASS** | `spl-token display`: Supply `100000000` (6 decimals), Mint authority `(not set)`, Freeze authority `(not set)`. Mint [`BcJMF…`](https://explorer.solana.com/address/BcJMFwHKgxckrbsjxiQGCH6FhKa2MK5k1jh3MUNtv7s8?cluster=devnet) |
| b | Leftover = 65,000,000 to receiver | **PASS** | `withdrawLeftover` ran; wallet `spl-token balance` **82,274,574.395579** = **65,000,000 leftover + 17,274,574.395579 curve buys** (same wallet bought the curve). Pre-withdraw balance was 17,274,572.596824; delta ≈ 65M. |
| c | Vesting escrow 10,000,000 + cliff | **PASS** | Escrow [`DnfbVH…`](https://explorer.solana.com/address/DnfbVH7J4DT8mVfcuAGyf4qyN39XVZvavUZVbnZ3F4pn?cluster=devnet) ATA holds **10,000,000**. On-chain `lockedVestingConfig`: `cliffDurationFromMigrationTime=15552000` (6 mo), `frequency=86400` (daily), `numberOfPeriod=182`. |
| d | LP permanently locked | **PASS** | Config `creatorPermanentLockedLiquidityPercentage=100`. Migrate tx logs `Instruction: PermanentLockPosition`. Position `5cwYaN…`: `isPermanentLockedPosition=true`, `permanentLockedLiquidity>0`, `unlockedLiquidity=0`. |
| e | curve-sold + leftover + vesting ≈ 100M | **PASS** | See arithmetic below. |

### Arithmetic (UI amounts, 6 decimals)

| Bucket | Amount |
|---|---|
| Leftover (treasury stand-in) | 65,000,000 |
| Team vesting escrow | 10,000,000 |
| Curve-sold (wallet buys + DAMM migration base + dust) | ≈ 25,000,000 |
| **Total** | **100,000,000** |

Largest holders observed:

- Wallet ATA: **82,274,574.395579** (= leftover 65M + wallet curve buys ≈ 17.27M)
- Vesting escrow ATA: **10,000,000**
- DAMM pool token vault: **7,709,974.802813**
- Dust ATA: **15,450.801608**
- Sum: **100,000,000.000000**

---

## Schema differences

Vs prompt wording / older `cyre_dbc_config.devnet.jsonc`, against today’s `studio/config/dbc_config.jsonc`:

| Prompt / older | Current field | Notes |
|---|---|---|
| Immutable authority | `token.tokenAuthorityOption: 1` | Enum value **1 = Immutable** |
| Decimals default | `tokenBaseDecimal: 6`, `tokenQuoteDecimal: 9` | Explicit in template |
| Curve caps | `initialMarketCap` / `migrationMarketCap` with `buildCurveMode: 1` | Mode 0 uses different fields — do not mix |
| Cap values this run | **0.1 / 0.5** (was 0.5/2 then 0.2/1) | Shrunk for ~1 SOL faucet; allocation math unchanged |
| Migration fee 0% | `migration.migrationFee.feePercentage: 0` | Separate from `migrationFeeOption` |
| migrationFeeOption 2 | `migration.migrationFeeOption: 2` | 1% LP fee on DAMM |
| 100% creator LP lock | `creatorPermanentLockedLiquidityPercentage: 100` (+ others 0) | Must total 100% |
| creatorTradingFeePercentage 100 | `fee.creatorTradingFeePercentage: 100` | Direct launch |
| Team vest schedule | `lockedVesting.*` durations in **seconds**; periods = unlock steps | On-chain also stores `frequency=86400` |
| Image URI (PNG) | Used Metaplex **`metadata.uri` → `https://cyre.dev/token-metadata.json`** | PNG alone is not a metadata JSON; JSON’s `image` points at `cyre-token-512.png` |
| New template fields | `poolCreationFee`, `enableFirstSwapWithMinFee` | Set `0` / `false` |
| Post-migration leftover | **No studio CLI** — BUILD `client.migration.withdrawLeftover` | Required for 65M to land |
| Near tip | Large last buys → `Insufficient Liquidity` | Finish with micro buys (down to ~8e-8 SOL here) |

---

## Lessons for mainnet

1. Faucets are flaky; keep caps tiny for rehearsal only — **mainnet caps are independent of this 0.1/0.5 dry run**.
2. Always **`withdrawLeftover`** after migrate before treating treasury balance as final.
3. Same wallet buying the curve inflates `spl-token balance` above 65M — subtract curve buys or use a dedicated leftover receiver for a clean 65M read.
4. Flat 100 bps fee schedule avoids anti-sniper fee eating the tiny tip; mainnet may still want a decaying scheduler.
5. Plan shrinking buys for the last ~1% of graduation.
