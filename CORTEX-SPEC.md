# GUARDIAN NEURAL CORTEX — AGENT FUND CONSTITUTION

Source of truth for the agent-desk graph shown on `/cortex` (`cortex.html`).
`SPEC.md` §2 outranks this file. The visual is the org chart; this file is the build plan.

**Product name in UI:** Guardian Neural Cortex  
**Internal metaphor:** a hedge-fund desk layout (research → signals → risk → execution)  
**Reality:** watch / measure / paper-only. Guardian never takes custody and never moves funds.

---

## 1. WHAT THIS IS

Claude's cortex design is an **agent fleet graph**, not a registered securities fund.

| Layer | Role |
|---|---|
| Visual | Full-bleed node graph + HUD (`cortex.html`) |
| Status API | `GET /api/cortex` — measured desk state, no invented % |
| Desks | Named agents that map onto existing CYRE products |

Stance line (always): *Patterns, not verdicts.* Status chip: **WATCHING**.

---

## 2. DESK MAP (nodes → product)

| Node id | Desk | v1 status | Wired to |
|---|---|---|---|
| `guardian core` | Portfolio lead (observer) | live | Cortex HUD / chat persona |
| `research` | Research | deferred | filings + sentiment (not wired) |
| `signals` | Signals | live (quiet) | `/api/signals` — empty default list |
| `execution` | Execution | **paper-only** | Never signs txs; future paper ledger only |
| `risk` | Risk | live / deferred | `/api/oracle` pattern counters |
| `ops` | Ops | live | Render crons + site pulse (light) |
| `watchlist` | Watch | live (quiet) | `/api/watch` — empty default list |
| `chain feed` | Chain ingest | live | `/api/chain-pulse` |
| `filings` | Filings ingest | deferred | TBD |
| `sentiment` | Sentiment ingest | deferred | TBD |
| `vector store` | Memory | deferred | TBD |
| `embeddings` | Embedding worker | deferred | TBD |
| `attestations` | Attestations | deferred | TBD |
| `kill-switch` | Kill switch | **armed** | Blocks any future execution path |

Links in `cortex.html` are the intended data-flow edges. Do not add “alpha”, PnL, AUM, or return claims anywhere on this surface.

---

## 3. NON-NEGOTIABLES (in addition to SPEC §2)

1. **No custody.** Cortex never holds keys or funds.
2. **No live execution.** `execution` is paper-only until a separate founder-approved SPEC rewrite.
3. **Kill-switch stays armed** whenever execution is paper-only or disabled.
4. **No invented metrics.** HUD numbers come from `/api/cortex` measured fields only. Ambient graph motion (pulses, spring layout) is decorative, not a KPI.
5. **No scam/safe/buy/sell language.** Tags are pattern language only (`SETTLED`, `FLAG`, `HOLD`, `SIG VALID`, `ATTEST`) and only when measured or explicitly marked ambient-demo.
6. **Default lists stay empty** (same Watch/Signals policy) until quiet holders are approved.

---

## 4. API — `GET /api/cortex`

Light aggregator. `Cache-Control: no-store`. Soft-fail expensive deps.

```json
{
  "ok": true,
  "kind": "cyre-cortex",
  "version": 1,
  "disclaimer": "Patterns, not verdicts. Agent desks watch — no custody, no live execution.",
  "fetchedAt": "ISO-8601",
  "status": "WATCHING",
  "graph": { "nodes": 14, "links": 23 },
  "chain": { "ok": true, "slot": 0, "ageSec": 0 },
  "oracle": { "ok": true, "feedsEvaluated": 0, "feedsConfigured": 6, "patternsTriggered": 0 },
  "signals": { "ok": true, "items": 0, "policy": "empty-default-list" },
  "desks": [ { "id": "chain feed", "state": "live", "detail": "…" } ],
  "stream": {
    "research": { "mode": "deferred", "pct": null },
    "signals": { "mode": "quiet", "pct": 0 },
    "risk": { "mode": "measured", "pct": 0 }
  },
  "hotNode": "chain feed",
  "killSwitch": "armed",
  "execution": "paper-only"
}
```

`stream.*.pct` is null when deferred; never invent a decorative percentage.

---

## 5. BUILD ORDER

1. **Ship visual + status API** (done): `cortex.html` reads `/api/cortex`; SPEC inventory.
2. **Make it operable** (this layer): clickable desks → live products; paper ledger; Guardian App entry (`/app#cortex`).
3. **Homepage embed** — merge/land PR #82 (banner → cortex iframe) when founder-ready.
4. **Research ingest** — filings/sentiment only after sources are verified (no scraping secrets into repo).
5. **Memory substrate** — vector store / embeddings only with explicit cost caps.

---

## 5b. HOW TO GET THE PRODUCT WORKING (ops)

Cortex is a **control surface** over desks that already exist. It is not a live trading fund.

| Step | Who | Action |
|---|---|---|
| 1 | Founder | Merge PR that ships `/cortex` + `/api/cortex` |
| 2 | Founder | Confirm Vercel env: `SOLANA_RPC` (required for slot), optional `PYTH_LAZER_API_KEY` (risk desk measured) |
| 3 | Anyone | Open `https://cyre.dev/cortex` — graph + HUD sync every 30s |
| 4 | Anyone | Use desk dock / click nodes: **signals** → `/signals`, **risk** → `/oracle`, **watchlist** → `/watch`, **execution** → paper ledger |
| 5 | Anyone | Or open **Guardian App → Neural Cortex** (`/app#cortex`) |
| 6 | Founder | Optional: merge homepage cortex banner (PR #82) so visitors see the graph on `/` |

**Working definition:** desks that are `live`/`quiet`/`watching` open a real measured product; deferred desks show a toast and do nothing else; execution only writes local paper notes; kill-switch stays armed.

**Not in scope until SPEC rewrite:** custody, signing, live orders, AUM, returns, or raising capital.

---

## 6. VERIFY

- `GET /cortex` → 200, title contains Neural Cortex  
- `GET /api/cortex` → `ok:true`, `kind:"cyre-cortex"`, `disclaimer` present, `Cache-Control: no-store`  
- HUD shows **WATCHING**; execution detail shows paper-only; kill-switch armed  
- No revenue / AUM / return / accuracy claims on the page  
