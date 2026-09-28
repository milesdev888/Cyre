# $C7 Local Rehearsal Results

Ran 2026-08-24 on a **local** `solana-test-validator` with Meteora DBC/DAMM/Locker BPF programs from `meteora-invent` (public Devnet faucets blocked AI/rate-limits).

## Outcome: PASS

| Claim | Result |
|---|---|
| Mint immutable | `mintAuthority=null`, `freezeAuthority=null` |
| Supply fixed 100M | `100000000` |
| Leftover 65M to receiver | After `withdrawLeftover`, wallet held **81,666,666** C7 (= 65M leftover + ~16.67M bought on curve) |
| Team vest 10M | Vesting escrow `2F9zxFx…` holds **10,000,000** C7 |
| LP 100% permanent lock | Config: partnerPermanentLocked **50%** + creatorPermanentLocked **50%** |
| Migrated to DAMM v2 | `isMigrated=1` |

### Addresses (local only — throwaway)

- Wallet / leftoverReceiver: `JC3bz7quGAg6cBVJpaQATf4UDdigfMGr8mkW9HjTT6ee`
- Mint (C7): `D5kCA5oXev553mHKZ9dYRj3LoXSB7am9WqiqnBX5Kpvj`
- DBC pool: `66149bCMi8Zx8cNkuUitAHjhSZkbrVh4NSp1TFJQivMK`
- Config: `J5D1cf21WriE8ta4guESAfnNPkjX5vgESEpQFvykGsrT`
- Vesting escrow: `2F9zxFxTiLwLCtH6FVdHwBLr6vd4tQo3X1MVpFwdPsYw`

## Lessons for mainnet / real Devnet

1. **Metadata:** use a hosted `token-metadata.json` URI — Irys upload fails on localnet and needs funded SOL on Devnet.
2. **Final curve fill:** with leftover 65M + vest 10M, only ~25M trades on the curve. Large last buys can hit `Insufficient Liquidity` while still a few lamports under threshold. Use shrinking buys (or a binary-search finish swap).
3. **Anti-sniper 50% fee:** burns through curve tokens vs quote-reserve progress. Wait for the fee scheduler to decay, or rehearse with flat 1% first.
4. **After migrate:** call **`withdrawLeftover`** — 65M does not auto-appear in the wallet.
5. **Localnet only:** fund `deriveDbcPoolAuthority()` with ~0.1 SOL before migrate, or CreateLocker rent fails (`insufficient lamports 0, need 2951040`).

## Commands that completed the run

```bash
pnpm start-test-validator   # from meteora-invent/studio
pnpm exec tsx src/actions/dbc/create_config.ts
pnpm exec tsx src/actions/dbc/create_pool.ts --config <CONFIG>
# swap until quoteReserve >= threshold
pnpm exec tsx src/actions/dbc/migrate_damm_v2.ts --baseMint <MINT>
# then withdrawLeftover via SDK migration.withdrawLeftover
```
