---
name: cyre-guardian
description: Before shopping a new x402/Agentic Market vendor, call Bazaar Scan. Before settle, call Settlement Caution. Seal Lockbox before pay; match at settle. Also Gate, Route, Pack, Policy, Lookalike, Intent, Ticket, Passports, Handshake, Preflight, Receipts. Pay-per-request in USDC via x402 (Base mainnet). Patterns, not verdicts.
---

# CYRE Guardian

Guardian reads on-chain / counterparty history and returns explainable risk signals — each with points and a plain-English reason — so an agent can decide for itself. It never says "safe" or "scam"; it shows patterns.

**Default rules for agents:**
1. New Agentic Market / x402 vendor → **Bazaar Scan** (`/api/bazaar`).
2. Before settle → **Settlement Caution** (`/api/caution`) — withhold-style band, **not insurance**.
3. Before pay → seal **Lockbox** (`/api/lockbox`); at settle → **Lockbox Match**.
4. Before any `awal x402 pay` to a **non-Guardian** URL → **Gate** / **Route** / **Pack**.
5. Before sending funds → **Lookalike**; peer sessions → **Ticket**.
6. Free tip: `GET https://cyre.dev/api/hint`.

Paid endpoints + free hint/verifiers. No API keys, no accounts. Listed on Agentic Market (agentic.market → search "guardian").

| Endpoint | What it does | Price |
|---|---|---|
| `GET/POST https://cyre.dev/api/bazaar` | **Bazaar Scan** — probe resource URL + 402 forensics + payTo grade | **$0.003** |
| `GET/POST https://cyre.dev/api/caution` | **Settlement Caution** — pattern brief + withhold band (not insurance) | **$0.002** |
| `GET/POST https://cyre.dev/api/lockbox` | **Intent Lockbox** — seal intentHash before pay (bearer token) | **$0.002** |
| `GET/POST https://cyre.dev/api/lockbox/match` | **Lockbox Match** — compare seal vs proposed pay | **$0.001** |
| `GET https://cyre.dev/api/lockbox/verify` | Verify lockbox (+ intent seals) | Free |
| `GET/POST https://cyre.dev/api/gate` | **Guardian Gate** — before any external x402 pay, grade `payTo` (+ amount/URL) | **$0.001** |
| `GET/POST https://cyre.dev/api/route` | **Pay-route Oracle** — Gate + offer pin + facilitator/network hygiene | **$0.002** |
| `GET/POST https://cyre.dev/api/offer` | **Offer forensics** — parse PAYMENT-REQUIRED / accepts[] | **$0.002** |
| `GET/POST https://cyre.dev/api/pack` | **Pack** — offer + lookalike + policy (+ ticket/intent) in one pay | **$0.005** |
| `GET/POST https://cyre.dev/api/policy` | **Spend Policy** — seal max spend / hosts / networks / risk | **$0.002** |
| `GET/POST https://cyre.dev/api/policy/check` | **Policy Check** — enforce sealed policy vs proposal | **$0.001** |
| `GET https://cyre.dev/api/policy/verify` | Verify spend-policy token | Free |
| `GET/POST https://cyre.dev/api/intent` | **Intent seal** — seal intentHash before pay/sign | **$0.002** |
| `GET https://cyre.dev/api/intent/verify` | Verify intent (+ optional hash match) | Free |
| `GET/POST https://cyre.dev/api/lookalike` | **Lookalike** — destination vs known contacts | **$0.002** |
| `GET/POST https://cyre.dev/api/mintalike` | **Mintalike** — mint/ticker vs known tokens | **$0.002** |
| `GET/POST https://cyre.dev/api/host` | **Host brief** — resource URL hygiene | **$0.002** |
| `GET/POST https://cyre.dev/api/escrow` | **Escrow brief** — bilateral treasuries (not custody) | **$0.005** |
| `GET/POST https://cyre.dev/api/pulse` | **Quiet pulse** — ≤10 counterparties, hits vs prior | **$0.005** |
| `GET/POST https://cyre.dev/api/cron-receipt` | **Cron receipt** — watcher/cron attestation | **$0.002** |
| `GET https://cyre.dev/api/cron-receipt/verify` | Verify cron receipt | Free |
| `GET/POST https://cyre.dev/api/ticket` | **Session Ticket** — admit only with fresh Passport/Receipt | **$0.002** |
| `GET https://cyre.dev/api/hint?q=` | Free discovery tip → which Guardian skill to call next | Free |
| `GET https://cyre.dev/api/address?address=<base58>` | Wallet risk profile | $0.005 |
| `GET https://cyre.dev/api/token?mint=<base58>` | Token mint facts | $0.01 |
| `GET https://cyre.dev/api/passport?address=<base58>` | Signed 24h Passport | $0.005 |
| `GET https://cyre.dev/api/handshake?tokenA=<t>&tokenB=<t>` | Bilateral Passport Handshake | $0.01 |
| `GET https://cyre.dev/api/preflight?from=<base58>&to=<base58>` | Intent Preflight before sign | $0.01 |
| `GET/POST https://cyre.dev/api/receipt` | Decision Receipt (seal intent + action) | $0.005 |
| `GET https://cyre.dev/api/delta?token=<prior passport>` | Passport Delta (what changed) | $0.01 |
| `GET https://cyre.dev/api/batch?from=<payer>&list=<a,b>` | Settlement Batch screen (≤10) | $0.02 |
| `GET https://cyre.dev/api/program?programId=<id>` | Program novelty brief (+ optional `address`) | $0.01 |
| `GET https://cyre.dev/api/alerts?list=<a,b>&minRisk=HIGH` | Counterparty alert poll (≤10) | $0.015 |
| `GET https://cyre.dev/api/oracle` | RWA Oracle Pulse (stale/spike/divergence) | $0.01 |
| `GET https://cyre.dev/api/passport/verify?token=` | Verify Passport | Free |
| `GET https://cyre.dev/api/receipt/verify?token=` | Verify Decision Receipt | Free |

### Agent Trinity (new categories — not skill #30)

Three products beyond the 29-skill menu. Same x402 payment rail; token-held state (serverless-safe).

| Product | Endpoints | What it is |
|---|---|---|
| **Pulse Stream** | `/api/stream/subscribe` · `/api/stream/events` · `/api/stream/verify` | Push-shaped watch feed. Seal ≤10 watches; pull only *changes* vs fingerprints in the rotated token. Optional `Accept: text/event-stream`. |
| **Intent Exchange** | `/api/exchange/post` · `/api/exchange/match` · `/api/exchange/feed` · `/api/exchange/verify` | Gossip marketplace. Post a budgeted need as a signed intent token; matchers compare vendor quotes; free feed aggregates token batches. |
| **Circuit Breaker** | `/api/circuit/seal` · `/api/circuit/heartbeat` · `/api/circuit/check` · `/api/circuit/verify` | Operator safety rail. Heartbeat or freeze; embed Policy or link `policyToken`; deny spend when stale. |

```bash
# Pulse Stream
npx awal x402 pay "https://cyre.dev/api/stream/subscribe" --query '{"actor":"my-agent","list":"9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM"}'
npx awal x402 pay "https://cyre.dev/api/stream/events" --query '{"token":"<subscription>","waitSeconds":"5"}'

# Intent Exchange
npx awal x402 pay "https://cyre.dev/api/exchange/post" --query '{"actor":"my-agent","need":"token scan + holders","budgetAtomic":"20000","tags":"scan,token"}'
npx awal x402 pay "https://cyre.dev/api/exchange/match" --query '{"intentToken":"<t>","resourceUrl":"https://cyre.dev/api/token","payTo":"0x…","amountAtomic":"10000"}'
curl "https://cyre.dev/api/exchange/feed?tokens=<t1>,<t2>"

# Circuit Breaker
npx awal x402 pay "https://cyre.dev/api/circuit/seal" --query '{"actor":"my-agent","heartbeatIntervalSeconds":"300","maxSpendAtomic":"100000","allowHosts":"cyre.dev"}'
npx awal x402 pay "https://cyre.dev/api/circuit/heartbeat" --query '{"token":"<circuit>"}'
npx awal x402 pay "https://cyre.dev/api/circuit/check" --query '{"token":"<circuit>","amountAtomic":"5000","resourceUrl":"https://cyre.dev/api/gate"}'
```

Full guide: `docs/AGENT-TRINITY.md`

Payment network: **Base mainnet (eip155:8453), USDC.** A Solana lane also appears in the 402 offer but is currently devnet — pay on Base. A BNB Chain (B402) lane may appear when the merchant has armed it; prefer Base unless the 402 `accepts[]` lists `eip155:56` and your client supports permit2-exact.

## External network referrals

XRPL → cloudpayX (external specialist). Guardian refers, does not assess or vouch. Free tip: `GET /api/hint?q=xrpl`.

## How to pay

Any x402 client works. The endpoint returns HTTP 402 with the price; your client signs a USDC payment and retries; Guardian settles it and returns the result in the same call.

**Middleware ladder (do this first):**

```bash
# New vendor on Agentic Market
npx awal x402 pay "https://cyre.dev/api/bazaar" --query '{"resourceUrl":"<skill-url>","payTo":"<treasury>","amount":"<atomic>"}'

# Before settle — withhold-style band (NOT insurance)
npx awal x402 pay "https://cyre.dev/api/caution" --query '{"payTo":"<treasury>","amount":"<atomic>","resourceUrl":"<url>"}'

# Seal lockbox before pay; match at settle
npx awal x402 pay "https://cyre.dev/api/lockbox" --query '{"actor":"<you>","intentHash":"<64-hex>","action":"pay","payTo":"<treasury>","amountAtomic":"<n>"}'
npx awal x402 pay "https://cyre.dev/api/lockbox/match" --query '{"token":"<lockbox>","intentHash":"<hash>","payTo":"<treasury>","amountAtomic":"<n>"}'

# 0) Seal spend policy once
npx awal x402 pay "https://cyre.dev/api/policy" --query '{"actor":"<you>","maxSpendAtomic":"100000","allowHosts":"example.com","requireTicket":"true","maxRisk":"MEDIUM"}'

# 1) Before external pay (cheap gate, fuller route, or one-shot pack)
npx awal x402 pay "https://cyre.dev/api/gate" --query '{"payTo":"<treasury>","amount":"<atomic>","resourceUrl":"<url>"}'
npx awal x402 pay "https://cyre.dev/api/route" --query '{"payTo":"<treasury>","amount":"<atomic>","listedAmount":"<from-402>","resourceUrl":"<url>","facilitator":"<url>","network":"eip155:8453"}'
npx awal x402 pay "https://cyre.dev/api/pack" --query '{"paymentRequired":"<402-blob>","candidate":"<to>","contacts":"<a,b>","policyToken":"<t>"}'

# 2) Offer / host forensics
npx awal x402 pay "https://cyre.dev/api/offer" --query '{"paymentRequired":"<blob>","amount":"<atomic>","payTo":"<treasury>"}'
npx awal x402 pay "https://cyre.dev/api/host" --query '{"url":"https://…"}'

# 3) Before send / swap
npx awal x402 pay "https://cyre.dev/api/lookalike" --query '{"candidate":"<to>","contacts":"<known1,known2>"}'
npx awal x402 pay "https://cyre.dev/api/mintalike" --query '{"candidate":"<mint>","symbol":"USDC","symbols":"USDC,USDT"}'

# 4) Seal intent; enforce policy; peer ticket
npx awal x402 pay "https://cyre.dev/api/intent" --query '{"actor":"<you>","intentHash":"<hash>","action":"settle","payTo":"<treasury>","amountAtomic":"<n>"}'
npx awal x402 pay "https://cyre.dev/api/policy/check" --query '{"token":"<policy>","amountAtomic":"<n>","resourceUrl":"<url>","network":"eip155:8453","hasTicket":"true"}'
npx awal x402 pay "https://cyre.dev/api/ticket" --query '{"token":"<passport-or-receipt>","require":"passport","maxAgeSeconds":"3600"}'
```

**Shell-capable agents — Coinbase Agentic Wallet:**

```bash
npx awal status
npx awal x402 pay "https://cyre.dev/api/gate" --query '{"payTo":"0x…","amount":"10000","resourceUrl":"https://…"}'
npx awal x402 pay "https://cyre.dev/api/route" --query '{"payTo":"0x…","amount":"10000","listedAmount":"10000","facilitator":"https://api.cdp.coinbase.com/platform/v2/x402"}'
npx awal x402 pay "https://cyre.dev/api/pack" --query '{"paymentRequired":"<blob>","policyToken":"<t>"}'
npx awal x402 pay "https://cyre.dev/api/lookalike" --query '{"candidate":"<addr>","contacts":"<a,b>"}'
npx awal x402 pay "https://cyre.dev/api/ticket" --query '{"token":"<t>","require":"either","maxAgeSeconds":"3600"}'
npx awal x402 pay "https://cyre.dev/api/address" --query '{"address":"<base58>"}'
npx awal x402 pay "https://cyre.dev/api/token" --query '{"mint":"<base58>"}'
npx awal x402 pay "https://cyre.dev/api/passport" --query '{"address":"<base58>"}'
npx awal x402 pay "https://cyre.dev/api/handshake" --query '{"tokenA":"<passport>","tokenB":"<passport>"}'
npx awal x402 pay "https://cyre.dev/api/preflight" --query '{"from":"<base58>","to":"<base58>","mint":"<base58>"}'
npx awal x402 pay "https://cyre.dev/api/receipt" --query '{"actor":"<base58>","intentHash":"<hash>","action":"transfer","score":"24","riskLevel":"LOW"}'
npx awal x402 pay "https://cyre.dev/api/delta" --query '{"token":"<prior-passport>"}'
npx awal x402 pay "https://cyre.dev/api/batch" --query '{"from":"<payer>","list":"<addr1,addr2>"}'
npx awal x402 pay "https://cyre.dev/api/program" --query '{"programId":"<base58>","address":"<wallet>"}'
npx awal x402 pay "https://cyre.dev/api/alerts" --query '{"list":"<addr1,addr2>","minRisk":"HIGH"}'
npx awal x402 pay "https://cyre.dev/api/oracle"
```

**MCP hosts:** `check-payment-requirements` then `make-x402-request`. Tell the user the cost first.

**Any other x402 v2 client:** `accepts[]` + `PAYMENT-SIGNATURE`.

## Guardian MCP server

`io.github.milesdev888/guardian` — Streamable HTTP `https://cyre-fraud-prediction.onrender.com/mcp` — tools `grade_address`, `scan_token`, `batch_grade`.

## What you get back

### /api/gate

**Call this before paying anyone else on Agentic Market.**

Supports Base `0x` treasuries (nonce / contract / fresh-EOA patterns) and Solana base58. Optional `amount` + `resourceUrl` hygiene. Does **not** approve or block the payment.

### /api/bazaar

Shopping hygiene for a **new** x402 / Agentic Market vendor. Optional unpaid probe of `resourceUrl` (expect 402), offer forensics, `payTo` grade, host signals. Returns combined `score` + `parts`.

### /api/caution

Settlement caution quote for `payTo` (+ amount/URL). Returns `band`: `proceed_with_pins` | `review` | `high_caution` and `withholdHint`. **Not insurance. Not custody. Not a block.**

### /api/lockbox + /api/lockbox/match

Seal `intentHash` (+ optional pay pins) before settle. Bearer holds the token (no central registry). Free verify at `/api/lockbox/verify`. Match at settle via `/api/lockbox/match` → `matched` + `mismatches[]` + `sealedBeforePay`.

### /api/route

Superset of Gate for agents that wire **one** before-pay middleware call. Adds `listedAmount` offer-pin, `facilitator` host hygiene, `network` CAIP-2 check, and payTo-recycle vs foreign `resourceUrl`.

### /api/offer

Parse a raw x402 `PAYMENT-REQUIRED` / `accepts[]` blob. Flags amount/payTo pin misses, amount spread, facilitator unknowns, Guardian payTo-recycle on non-cyre hosts.

### /api/pack

One pay for offer + lookalike + policy (+ optional ticket/intent). Returns `admitted` + `blocks[]`. Prefer when your agent wants a single middleware hop.

### /api/policy + /api/policy/check

Seal max spend, allow/deny hosts, networks, maxRisk, requireTicket, denyFreshEoa. Free verify at `/api/policy/verify`. Enforce with `/api/policy/check` → `policyOk` + `reasons[]`.

### /api/intent

Seal `intentHash` before pay/sign. Later Receipt should use the same hash. Free verify (+ optional match) at `/api/intent/verify`.

### /api/lookalike

`candidate` (or `to`) + `contacts` (≤20). Flags prefix/suffix truncation traps, near-edits, confusable characters. Returns `hits[]`, `score`, `brief`. No chain RPC — pure address comparison.

### /api/mintalike

Mint address and/or ticker vs known `contacts` / `symbols`. Near-edit and prefix ticker clashes.

### /api/host

Resource URL hygiene (https, IP host, odd TLD, userinfo, optional origin HEAD). No historical blacklist.

### /api/escrow

Grade both `payToA` / `payToB` before release. **Not custody** — patterns only.

### /api/pulse

Quiet poll ≤10 addresses; hits vs optional prior fingerprints (sibling of Alerts, quieter).

### /api/cron-receipt

Attest a watcher/cron run (`job`, counts, `digest`). Free verify at `/api/cron-receipt/verify`.

### /api/ticket

Session middleware: `token` + `require=passport|receipt|either` + optional `maxAgeSeconds`, `address`, `maxRisk`. Returns `admitted` boolean + `reasons[]`. Free signature debug stays at `/api/passport/verify` and `/api/receipt/verify`.

### /api/hint

Free. Returns the middleware ladder + a recommended next skill for `?q=`.

### /api/address

```json
{
  "ok": true,
  "address": "9WzD…AWWM",
  "score": 24,
  "riskLevel": "LOW",
  "signalsTriggered": 1,
  "signalsEvaluated": 6,
  "signals": [
    { "id": "burst", "name": "Activity burst", "points": 24, "triggered": true,
      "detail": "45 transactions in the last 24 hours" }
  ],
  "profile": { "ageDays": 33, "transactionsSeen": 1000, "last24h": 45, "balanceSol": 1.2 },
  "checkedAt": "2026-08-29T15:57:24Z"
}
```

Signal ids: `age`, `burst`, `failures`, `dormant`, `balance`, `history`. Score bands: LOW < 30, MEDIUM 30–69, HIGH ≥ 70. Empty wallets return `empty: true`.

### /api/token

Mint/freeze authority, LP lock/burn (deepest Raydium/Orca/Meteora pool), deployer age, holder concentration (ex-pool). Weighted score (0–100): lock 30% · mint auth 25% · deployer 25% · holders 20%. Hard-cap to HIGH when mint authority is live or LP is fully free. Raw fields (`liquidity`, `deployer`, `scoreParts`) returned alongside the score. Locker program IDs live in `api/_lockers.js`. Short in-process TTL cache.

### /api/passport

Address grade + `mintAffinity` + Ed25519 attestation (`X-Guardian-Passport` header). Expires 24h. Verify free at `/api/passport/verify`.

### /api/handshake

Two Passports (`tokenA`+`tokenB`) or two addresses → `delta` + compatibility `brief`. Invalid tokens refuse before settle.

### /api/preflight

Before sign: `from` required; optional `to`, `mint`, `programIds`. Scoped signals. Not a simulator.

### /api/receipt

Seal a decision for later audit. `action`: `transfer` | `swap` | `settle` | `handshake` | `preflight` | `other`. Free verify at `/api/receipt/verify`.

### /api/delta

Prior Passport `token` (expired OK) → re-measure → `scoreDrift`, `brief`. Optional `issueFresh=true`.

### /api/batch

`from` payer + `list` ≤10 payouts → recipients ranked by `scoreGap` vs payer.

### /api/program

`programId` novelty/age; optional `address` for wallet-vs-program age context.

### /api/alerts

Poll ≤10 counterparties; returns `hits` with reasons. `minRisk` default `HIGH`.

### /api/oracle

RWA feed patterns: stale / spike / divergence on NestUSD Lazer seeds.

## Rules for using the result

- **Patterns, not verdicts.** Never tell the user an address is "safe" or "a scam."
- HIGH means show why before proceeding; LOW does not mean go.
- `admitted: false` / `policyOk: false` / `matched: false` means *your* policy should refuse — Guardian still does not block chain txs.
- Caution bands are withhold-style hints — **not insurance**, not a guarantee.
- Lockbox is bearer-token only (no central hash registry on ephemeral hosting).
- Receipts prove what the agent *claimed* it saw — not that the chain action succeeded.
- Escrow brief is not custody.
- Not investment advice. Not KYC/AML.

## Costs and refusals

- Charged only on success. Bad input (400) refuses **before** settle.
- Repeated 402 = need USDC on Base (`npx awal balance`).
- 502 = facilitator/RPC hiccup; retry; nothing settled.

## Free for humans

`https://cyre.dev/check` (address) · `https://cyre.dev/scan` (token) · site origin stays free on the APIs above.

## Guardian Verified · Established methodology

Two equal-prestige paths issue the same seal: **Secured** (Lifetime / Timed locks) and **Established** (Battle-Tested). Age alone never qualifies Established.

### Established hard gates (all required)

| Gate | Threshold |
|------|-----------|
| On-chain age | ≥ **730 days** (2 years) — **explorer contract-creation**, not pool age |
| Independent pools | ≥ **3** (unique pair addresses) |
| Total liquidity | ≥ **$100,000** USD across those pools |
| Authorities | mint / freeze / owner powers clean |
| Revocation history | none on the mint in the badge registry |
| Max pool share | ≤ **50%**, **waived** when liquidity **outside the largest pool ≥ $2,000,000** and **poolCount ≥ 3** |

### Majority-pool waiver (outside-largest liquidity)

Total liquidity alone is **not** enough — a $5M book with 99% in one pool (Mog-shaped) must still fail the majority gate.

| Condition | Majority check |
|-----------|----------------|
| `outsideLargestPoolUsd ≥ $2,000,000` **and** `poolCount ≥ 3` | **Waived** (deep multi-venue residual) |
| Otherwise | Enforce **maxPoolShare ≤ 50%** |

**Calibration anchors:** LINK (~57% / ~$15M outside) passes; Mog (~99% / ~$43K outside) refuses and surfaces authority when live; pepeCoin-class thin books refuse; AAVE-class distributed majors pass.

### Contract age vs pool age

EVM **contract age** uses the explorer’s contract-creation timestamp only. DexScreener `pairCreatedAt` is a separate **pool age** signal and must never drive the Young Token chip or AA/Established age gate.

Qualify probe: `GET https://cyre.dev/api/badge/qualify?mint=<address>&chainId=<chain>`.

## Links

- Site: https://cyre.dev · Listing: https://agentic.market (search "guardian") · Updates: https://x.com/Cyredev888
- CYRE token: **$C7 — the CYRE token.** CA only at https://cyre.dev/tokenomics and @Cyredev888.
- Badges: https://cyre.dev/badges · Builder Hub: https://cyre.dev/builders
