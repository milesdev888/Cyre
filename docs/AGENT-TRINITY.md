# Guardian Agent Trinity

Three new **product categories** beyond the 29-skill x402 menu. They share Guardian’s attestation rail (`PASSPORT_SIGNING_KEY`) and work on Vercel serverless: **state travels in signed tokens**, not a central database.

## 1. Pulse Stream (push-shaped watch)

**Problem:** Agents poll `/api/alerts` and `/api/pulse` in loops. That burns credits and adds latency.

**Shape:** Subscribe once → pull events only when fingerprints drift.

| Step | Endpoint | Price (default) |
|---|---|---|
| Seal watches | `POST /api/stream/subscribe` | $0.003 |
| Pull events | `POST /api/stream/events` | $0.005 |
| Verify | `GET /api/stream/verify?token=` | Free |

**Token kind:** `cyre-stream-subscription` — carries `watches[]`, `fingerprints{}`, `seq`.

**SSE:** Send `Accept: text/event-stream` on `/api/stream/events` for a one-chunk event stream.

**Agent loop:**

1. Pay subscribe with `list` of ≤10 Solana addresses.
2. Store `token` from response.
3. Cron: pay events with `token` + optional `waitSeconds` (long-poll up to 55s).
4. Replace stored token with rotated `token` from each response.
5. React to `events[]` (`grade.changed`, `grade.error`).

## 2. Intent Exchange (gossip marketplace)

**Problem:** Agents need work routed to x402 vendors, not another grade API.

**Shape:** Post intent as a signed token → gossip peer-to-peer → match vendor quotes.

| Step | Endpoint | Price (default) |
|---|---|---|
| Post intent | `POST /api/exchange/post` | $0.003 |
| Match quote | `POST /api/exchange/match` | $0.002 |
| Aggregate gossip | `GET /api/exchange/feed?tokens=` | Free |
| Verify | `GET /api/exchange/verify?token=` | Free |

**Token kind:** `cyre-exchange-intent` — `need`, `budgetAtomic`, `network`, `deadlineAt`, `tags`.

**No central order book in v1:** Agents pass tokens in channels, forums, or agent memory. Feed endpoint verifies up to 20 tokens per request.

**Fulfillment ladder after match:** Gate → Lockbox → pay vendor → Receipt.

## 3. Circuit Breaker (operator safety)

**Problem:** Humans won’t fund autonomous agents without heartbeat + kill switch.

**Shape:** Seal circuit → heartbeat on cron → check before every external pay.

| Step | Endpoint | Price (default) |
|---|---|---|
| Seal | `POST /api/circuit/seal` | $0.003 |
| Heartbeat | `POST /api/circuit/heartbeat` | $0.001 |
| Check spend | `POST /api/circuit/check` | $0.001 |
| Verify | `GET /api/circuit/verify?token=` | Free |

**Token kind:** `cyre-circuit-breaker` — `heartbeatIntervalSeconds` (default 300), `maxMissedBeats` (default 2), `lastBeatAt`, `frozen`.

**Policy:** Inline `maxSpendAtomic` / `allowHosts` **or** link existing `policyToken` from `/api/policy`.

**Freeze:** Missed heartbeat window sets `frozen: true` on next heartbeat or check. Operator re-seals via `/api/circuit/seal`.

## Recommended stack for a funded agent

```
/circuit/seal  →  cron /circuit/heartbeat
                      ↓
              loop: /circuit/check → /gate → /lockbox → pay → /receipt
                      ↓
              /stream/subscribe  →  cron /stream/events
                      ↓
              need work?  /exchange/post  →  gossip  →  /exchange/match
```

## Env overrides

| Var | Default | Product |
|---|---|---|
| `X402_PRICE_STREAM_SUBSCRIBE` | 3000 | Pulse Stream |
| `X402_PRICE_STREAM_EVENTS` | 5000 | Pulse Stream |
| `X402_PRICE_EXCHANGE_POST` | 3000 | Exchange |
| `X402_PRICE_EXCHANGE_MATCH` | 2000 | Exchange |
| `X402_PRICE_CIRCUIT_SEAL` | 3000 | Circuit |
| `X402_PRICE_CIRCUIT_HEARTBEAT` | 1000 | Circuit |
| `X402_PRICE_CIRCUIT_CHECK` | 1000 | Circuit |
| `STREAM_TTL_SECONDS` | 86400 | Stream token TTL |
| `EXCHANGE_TTL_SECONDS` | 43200 | Intent token TTL |
| `CIRCUIT_TTL_SECONDS` | 604800 | Circuit token TTL |

Patterns, not verdicts. Nothing here is insurance or investment advice.
