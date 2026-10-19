# Alpenglow runbook — Cyre on Solana

Solana's Alpenglow consensus activates on mainnet-beta **Wed Oct 21 2026, ~14:50 UTC (7:50 AM PT), start of epoch 1064**.
Finality drops from ~12.8 s to ~150 ms; `confirmed` and `finalized` become the same state; vote
transactions leave blocks. (200 ms slots already landed at epoch 1053 on Oct 9.)

Audit of `Cyre`, `cyre-scan`, `cyre-fraud-api` (Oct 19): no websockets, no signature-status polling,
no `getBlock` / `getBlockCommitment`, no vote parsing. Every tx-count signal (burst ≥40/24h, ≥40/h,
fail-rate >0.3) is built from `getSignaturesForAddress` on a wallet or mint, which never contained
votes — **thresholds do not change**. Exposure is narrow and listed below.

## Before activation (do by Oct 20)

- [ ] Merge this PR. `api/token.js` now reads `SOLANA_COMMITMENT` (default `confirmed`) — no behavior change yet.
      Do **not** set it to `finalized` before activation; that adds ~12.8 s to every token scan today.
- [ ] `api/chain-pulse.js` now probes `getAgGenesisCert` and returns `alpenglow: true|false|null`.
      Site banner shows "· Alpenglow" once it flips. Check `curl -s https://cyre.dev/api/chain-pulse` returns `alpenglow: false` (or `null` if the RPC node is pre-Agave-4.3).
- [ ] Badge checkout: payments sent in the first ~20 min after activation (vote-only blocks, some slots
      deleted) will not be visible to `getSignaturesForAddress` / `getTransaction` until user blocks resume.
      Orders use a 30-min lock (`api/_badge-order.js` ORDER_TTL_MS). Either pause badge checkout
      14:30–15:30 UTC or plan to re-run `/api/badge/order/watch` for any order that expired in that window
      (`paidAt`/`paymentTx` beats EXPIRED once matched).
- [ ] Don't schedule ad-hoc `/api/watch` or watcher runs across 14:50–15:15 UTC; results from that window are unreliable.

## Activation window (Oct 21, 14:50–15:15 UTC)

- Expect `chain-pulse` to keep returning a slot. `alpenglow` flips to `true` when the genesis cert is served.
- Do nothing. No deploys, no env changes, no token scans used for public claims.

## After activation (Oct 21 PM or Oct 22)

- [ ] Vercel env (Cyre project): set `SOLANA_COMMITMENT=finalized` and redeploy. Post-Alpenglow this costs
      nothing (same ~150 ms) and removes the only dependency on `confirmed`, which Triton One says will be removed
      from RPC in a future release. Verify `/api/token?mint=<C7>` still returns holders.
- [ ] Confirm `/api/chain-pulse` shows `alpenglow: true` and the banner shows "· Alpenglow".
- [ ] If anything third-party reports TPS (Guardian copy, monitor page), reset baselines — network tx counts
      drop ~56% with no change in user activity. Nothing in our code computes TPS today.
- [ ] Optional follow-up: `api/chain-pulse.js` / `api/cortex.js` `getSlot` use `processed`; harmless, can move to
      `confirmed`/default later.

## Not affected

- `cyre-scan`: no commitment params, no polling, no block counts. 8 s per-call timeouts are network caps.
- `cyre-fraud-api`: `solana-payment-processor.js` never touches RPC (its `'confirmed'` is an internal status string).
  Separate pre-existing issue, unrelated to Alpenglow: `/api/payment/verify` accepts any signature string without
  an on-chain check. Fix or remove when convenient.
- x402 Solana lane: verification is delegated to the Coinbase facilitator; nothing to change on our side.

## References

- Anza: Alpenglow mainnet date — https://solanacompass.com/news/anza-sets-alpenglow-mainnet-date-solanas-consensus-switch-is-scheduled-for-october-21-at-about-1450-utc
- Triton One integrator guide — https://solanacompass.com/news/triton-one-publishes-alpenglow-integrator-guide-what-solana-rpc-grpc-and-indexing-users-must-change
- Chainstack: Alpenglow for developers — https://docs.chainstack.com/docs/solana-alpenglow-consensus
