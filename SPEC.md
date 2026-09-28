# CYRE — SITE SPEC (source of truth)

Any agent (Claude, Grok, @claude, human) working on this repo reads this file first.
The spec is the asset; code is rebuildable from it. Update this file whenever a rule
or feature changes — a PR that changes behavior without updating SPEC.md is incomplete.

Repo: `milesdev888/-Cyre-Guardian` · Deploys: Vercel → **cyre.dev** (auto on push to main)
X: @Cyredev888 · Founder approval required for every merge, post, and spend.

---

## 1. WHAT CYRE IS

CYRE — Global Synthetic Intelligence infrastructure for real-world assets on Solana.
Guardian is the AI that **watches** on-chain activity and flags fraud patterns.
Product stance: *watch, don't calculate* — users give an address, Guardian watches it.
Token: **$C7** ("$C7 — the CYRE token"), name CYRE, symbol C7, launching via
Meteora Dynamic Bonding Curve. Tokenomics: 100M supply — 60% dev treasury (2-yr linear
vesting) / 25% community curve / 10% team (12-mo vest, 6-mo cliff) / 3% airdrop
(2M community + 1M creators) / 2% exchange ops. LP 100% locked. CA published ONLY on
cyre.dev/tokenomics and @Cyredev888.

## 2. NON-NEGOTIABLES (apply to every agent, every change)

1. **Never push to `main`.** Work on branches; every change lands as a PR the founder merges.
   Main auto-deploys the live site AND rebuilds two Render crons.
2. **Never invent metrics.** Banned unless founder confirms they are measured:
   revenue/MRR figures, user or customer counts, transaction volumes, accuracy %,
   uptime %, protocol counts, pattern counts. (Scrubbed Aug 11 2026 pre-launch; the
   chat API system prompt enforces the same list.)
3. **Never label an address "scam" or "safe".** Guardian shows patterns and says so.
   "Patterns, not verdicts."
4. **Never present $C7 as an investment.** No price talk, no return promises.
   Early-stage / not-an-offer-of-securities disclosure stays on the site.
5. **Guardian never DMs first, never asks to connect a wallet.** This warning appears
   on /airdrop and must survive every redesign.
6. **No secrets in the repo.** Keys live in Vercel/Render env vars only. The X bridge
   secret is in the connector URL and Render env — never in a file.
7. **Homepage is a full redesign file** (`index.html`), not bolt-ons on the CYRE 7 shell.
   Prefer shipping a clean self-contained homepage on a branch/PR. Rollback = `index-legacy.html`.
   Secondary pages still use bolt-on scripts (§4). See §4.

## 3. FILE INVENTORY (repo root unless noted)

| File | What it is |
|---|---|
| `index.html` | **Guardian forest homepage** (Sep 2026): self-contained dark forest page — brand **Guardian** (eye-in-shield mark), headline "The chain has a witness.", gold `#D8BC66` + cream `#EDE7D5` on ink `#0A0F0A`, Cormorant + Inter + JetBrains Mono. Hero scan bar → `https://scan.cyre.dev/app` (Guardian console; auto-runs on `?address=`; Base58=Solana, `0x`=EVM multichain). Sections: SCAN/WATCH/SCORE/GATE grid, live `$C7` report card (`guardian-home-report.js` → `/api/token`), tokenomics CTA, request-access + Talk to Guardian. Loads `access-form.js`, `guardian-popout.js`, `guardian-home-report.js`. |
| `theme-guardian.css` | **Shared forest theme** for app + all secondary/tool pages. Remaps legacy blue tokens (`--cyan`, `--cb-blue`, `--ice`, `--ai-*`) to gold/cream/ink. Loaded by `/app`, Monitor, AM, Docs, product tools, and injected by `ai-vibe-loader.js`. |
| `index-legacy.html` | Previous cinematic homepage snapshot for rollback. Do not serve as `/`. |
| `guardian-home-report.js` | Homepage `$C7` report card — GET `/api/token` for mint/freeze/LP/top-holder; falls back to "See live report". |
| `theme-glass.css` | Crystal glassmorphism skin (loaded by launch-banner.js). Delete = revert skin. |
| `theme-purple-deep.css` | Forest mood overrides (filename kept for cache links). Imports `theme-guardian.css`; gold `#d8bc66` primary on ink `#0a0f0a`. Loaded by secondary chrome pages + injected by `ai-vibe-loader.js`. |
| `theme-blue.css` | Blue token overrides + avatar swap (`.portrait img` / `.g-av img` → /guardian2.jpg). |
| `guardian-popout.js` | FAB (`/guardian2.jpg` + LIVE) → glass panel with `/guardian-video.mp4` + chat POST `/api/chat`. Does not replace `guardian-voice.js`. |
| `nav-tools.js` | Ensures Guardian App link on secondary pages (standalone URLs redirect to `/app`). |
| `ai-vibe-loader.js` | Injects `theme-guardian.css` + `theme-ai-vibe.css` + `theme-purple-deep.css`; ensures nav-tools, guardian-popout, ai-presence, rwa/vortex/voice/access. Loaded by `launch-banner.js` (+ one-line on secondary pages). |
| `ai-presence.js` | SUPER AI idle: denser glow, orbit breathe/pulse, `.portrait` / orb rings (works with wireframe head wrap); reduced-motion safe. Loaded by `ai-vibe-loader.js`. |
| `footer-polish.js` | Footer Docs/Security → `/roadmap`; Privacy/Terms/Support → mailto. |
| `launch-banner.js` | Self-mounting: 3D word-funnel canvas banner (robot core), $C7 + Roadmap nav links, hero $C7 button (emblem), glass CSS loader, AI-vibe loader hook, claims-safe HUD bar. |
| `vortex.js` | Living particle/network mesh behind hero — violet-heavy mood (`#7048dc` / `#9b7bff`) with cyan accents (`#5fd0ff`) and sparse gold/amber dots (~12%; `#d4a84b` / `#ffb454`); continuous motion; static frame if `prefers-reduced-motion`. |
| `homepage.css` | Shared chrome styles — forest CTAs (`#d8bc66`), cream text, ink surfaces. Used by Monitor / AM / Docs mastheads. |
| `guardian-head.js` | Homepage hero canvas — **dust → mesh → photo → dust** (~22s): 0–16% dust; 16–30% dust→mesh; 30–48% dense violet/cyan particle wireframe head (soft eye bloom, no solid cartoon eyes); 48–60% mesh→photo; 60–82% her photo (`/guardian2.jpg` full-portrait crossfade, no circle crop/rim); 82–100% photo→dust. Fallback `/robot.jpg` if portrait fails. `prefers-reduced-motion` → static mesh. FAB/popout still uses `/guardian2.jpg`. |
| `guardian-voice.js` | "Hear Guardian": tap → talking video → mp3 → speech-synth fallback chain; robot morph. |
| `guardian-video.mp4` | 480² talking-Guardian clip (preload=none). |
| `guardian2.jpg` | Guardian portrait (blue girlbot, 600²) — FAB / popout / secondary avatars; also shown in hero morph photo phase. `robot.jpg` = fallback if portrait fails + funnel core. |
| `check-link.js` | Adds "Check an address" + "Grade your wallet" buttons to hero CTA row. |
| `access-form.js` | Early-access modal → Formspree `xqpzddvy`. |
| `rwa-widget.js` | Live RWA market strip under hero (pinned CoinGecko ids; keep "Data by CoinGecko"). Styled by AI-vibe theme. **Skips mount on `/check` and `/scan`** (ad landings). |
| `watch.html` | Watch v1 — real-time wallet monitor + measured alerts board → cyre.dev/watch. Default list empty; quiet wallets only. No CDN cache on `/api/watch` (fresh measured run). |
| `passport.html` | Passport v1 — portable RWA profile from measured address signals → cyre.dev/passport. Share/download PNG dossier + JSON. Visible disclaimer: Patterns, not verdicts. No CDN cache on `/api/passport`. |
| `check.html` | Guardian-branded address check (gold/dark, Cormorant wordmark). Multichain copy; Solana wallet signals via `/api/address`; `0x` → console. Ad-safe (no $C7 chrome). |
| `score.html` | Wallet Score Card — canvas dossier PNG + share loop → cyre.dev/score. |
| `tokenomics.html` | Donut + locks + CA box ("TBA — only here and @Cyredev888"). |
| `roadmap.html` | 4 phases: Shipped / Now / Next / Exploring (agent-economy items = research framing). |
| `airdrop.html` | 3M $C7, tabs Community (2M) / Creators (1M, #creators deep link), Guardian warning. |
| `auto.html` | Use Case 01 — tokenized dealer lot demo (synthetic). **Archived demo** at `/auto` with soft banner → `/oracle`. Primary product feed monitor is Oracle Pulse. |
| `forensics.html` | Forensics v1 — single-address RWA pattern board → cyre.dev/forensics. Measured only; `Cache-Control: no-store`. |
| `signals.html` | Signals v1 — public RWA pattern feed board → cyre.dev/signals. Default list empty (same Watch policy); measured hits only; `Cache-Control: no-store` on `/api/signals`. |
| `oracle.html` | Oracle Pulse v1 — mint/oracle-level RWA feed monitor → cyre.dev/oracle (prefer `/oracle` over `/pulse`). Feed board (not wallet paste). Patterns: stale / spike / divergence only. |
| `guardian-chain-live.js` | Homepage live Solana pulse — polls `/api/chain-pulse` every 30s; updates LIVE/WATCHING chips + banner. No wallet scans. |
| `api/chain-pulse.js` | GET `/api/chain-pulse` — one cached `getSlot` / 30s (`CHAIN_PULSE_CACHE_SEC`). Light UI pulse; **not** the Render watcher cron. |
| `apps.html` | Redirects to `/app` (legacy hub URL). |
| `app.html` | **Guardian Console** — single entry for all products → cyre.dev/app. |
| `app-redirect.js` | Standalone product URLs redirect to `/app#view` (skipped when `?embed=1` for iframes). **`/scan` (non-embed) redirects to the Guardian console** (`scan.cyre.dev/app?address=`). `/check` stays a Guardian-branded ad landing (gold/dark); `0x` pastes open the console. `/scan?embed=1` stays for App Scan & Swap (protected Jupiter). `rwa-widget.js` no-ops on `/check` and `/scan`. |
| `guardian-app.js` | Console routing, quick lookup, iframe loader, session context for address/mint. |
| `guardian-app.css` | Console shell styles (sidebar, dashboard, bottom nav) — forest palette matching homepage. |
| `embed-mode.js` / `embed-mode.css` | Hides page chrome when tools run inside Guardian App iframes (`?embed=1`). |
| `scan.html` | Guardian-branded Scan & Protected Swap (embed / legacy). Standalone `/scan` redirects to `scan.cyre.dev/app`. Embed keeps Jupiter gate. See `SWAP-SPEC.md`. |
| `scan-swap.js` | Scan-before-swap gate state machine (SWAP-SPEC §6). |
| `swap-config.js` | Jupiter referral pubkey + 50 bps fee config (fill after referral.jup.ag setup). |
| `SWAP-SPEC.md` | Guardian Protected Swap constitution + build order. |
| `api/token.js` | GET `/api/token?mint=` — mint/freeze authority + holder concentration + project `name`/`symbol` (RugCheck metadata + Jupiter search; client also falls back to DexScreener). Tries `getTokenLargestAccounts` on `SOLANA_RPC` (+ optional `SOLANA_RPC_FALLBACK`); if rate-limited, falls back to RugCheck measured `topHolders` pct only (never their risk score). Optional `&holders=1` light retry. Origin-locked to cyre.dev (+ this project's Vercel previews); 60/min throttle. |
| `watcher.cjs` | Render cron `guardian-watcher` (*/15): full wallet scan + optional tweets. **SUSPENDED 2026-09-09** (ESM/`require` crash after `package.json` `"type":"module"`). GHA schedule disabled. Re-enable only after founder review. |
| `mention-grader.cjs` | Render cron `guardian-mention-grader` (*/10): @mention + address → public grade reply via bridge. **SUSPENDED 2026-09-09** (same ESM crash). GHA schedule disabled. |
| `api/chat.js` | Guardian chat (Anthropic). HARDENED: origin-locked to cyre.dev, role-sanitized, haiku model, daily cap. Keep all guardrails. |
| `api/address.js` | GET /api/address — 1,000-sig window, 6 explainable signals, LOW/MED/HIGH. Env `SOLANA_RPC`. (Live file; SPEC formerly said `.mjs`.) |
| `api/watch.js` | GET /api/watch — `?address=` and optional `?list=` (≤10). Reuses address signals; fresh-window alerts; counters from this measured run only; `Cache-Control: no-store` (no CDN reuse). Marks noisy if last24h ≥ 200. No LLM. Env `SOLANA_RPC`. |
| `api/_attest.js` | Ed25519 attestation (`PASSPORT_SIGNING_KEY`). Kinds: passport, decision-receipt, spend-policy, intent-seal, intent-lockbox, cron-attestation. `attest` / `attestReceipt` / `attestPolicy` / `attestIntent` / `attestLockbox` / `attestCron` / `verifyToken({ kinds, allowExpired })`. |
| `api/_x402.js` | Shared x402 v2 gate (Solana + Base + dormant BNB Chain/B402). BSC lane arms only when `X402_PAY_TO_BSC` is set; see `docs/B402-RESEARCH.md` / `docs/B402-ENV.md`. XRPL inputs get a free `400` **external referral** to cloudpayX (cloudpayX schema) **before** any 402 (no charge). Pricing, site-origin bypass, validate-before-settle unchanged. |
| `lib/peers.js` | External network referrals + `detectNetwork` / `xrplHandoffBody` (cloudpayX schema: `status`, `supported_network`, `requested_network`, `recommended_provider`). Guardian refers, does not assess or vouch. |
| `docs/B402-RESEARCH.md` | Part 1 research: Binance B402 onboarding, Tesla RSA auth, wire shape, BSC assets/decimals, sandbox. |
| `docs/B402-ENV.md` | Vercel env checklist for dormant B402/BSC lane (no secrets). |
| `api/passport.js` | GET /api/passport — `?address=`. Stable Passport JSON + Ed25519 attestation. Same 1k-sig window as `/api/address`; seed-mint `mintAffinity`; x402; `Cache-Control: no-store`. No LLM. |
| `api/_grade.js` | Shared Solana graders — `gradeAddress`, `mintAuthorityFacts`, `programNovelty`, seed `mintAffinity`. Used by handshake/preflight/delta/batch/program/alerts. |
| `api/handshake.js` | GET/POST `/api/handshake` — bilateral Passport Handshake. Preferred `tokenA`+`tokenB` (verify before settle); fallback `addressA`+`addressB` (measure both). Returns `kind:'cyre-handshake'`, `delta`, `brief`. x402 default $0.01 (`X402_PRICE_HANDSHAKE`). `Cache-Control: no-store`. No LLM. |
| `api/preflight.js` | GET/POST `/api/preflight` — Intent Preflight before sign. Required `from`; optional `to`, `mint`, `programIds`. Grades actors + mint authorities + program novelty + lookalike shape. Returns `kind:'cyre-preflight'`, scoped `signals`, `brief`. x402 default $0.01 (`X402_PRICE_PREFLIGHT`). `Cache-Control: no-store`. No LLM. Not a tx simulator. |
| `api/receipt.js` | GET/POST `/api/receipt` — Decision Receipt. Seals `actor`+`intentHash`+`action` (+ optional score/risk/counterparties) into Ed25519 `cyre-decision-receipt`. x402 default $0.005 (`X402_PRICE_RECEIPT`). Header `X-Guardian-Receipt`. No LLM. |
| `api/receipt-verify.js` | Free verify for decision receipts — `/api/receipt/verify` rewrite. |
| `api/delta.js` | GET/POST `/api/delta?token=` — Passport Delta. Prior token may be expired; re-grades address; returns `scoreDrift`/`brief`; optional `issueFresh`. x402 default $0.01 (`X402_PRICE_DELTA`). |
| `api/batch.js` | GET/POST `/api/batch?from=&list=` — Settlement Batch (≤10). Rank recipients by score gap vs payer. x402 default $0.02 (`X402_PRICE_BATCH`). |
| `api/program.js` | GET/POST `/api/program?programId=&address=` — Program novelty brief + optional wallet context. x402 default $0.01 (`X402_PRICE_PROGRAM`). |
| `api/alerts.js` | GET/POST `/api/alerts?list=&minRisk=` — Counterparty alert poll (≤10). Hits only for risk/dormant/burst/failures. x402 default $0.015 (`X402_PRICE_ALERTS`). |
| `api/gate.js` | GET/POST `/api/gate` — **Guardian Gate**. Before any external x402 pay: grade `payTo` (Base EVM via `BASE_RPC` or Solana), optional `amount`/`resourceUrl`/`from`. x402 default **$0.001** (`X402_PRICE_GATE`=1000). Tags include gate/before-pay/checkout. `Cache-Control: no-store`. No LLM. |
| `api/route.js` | GET/POST `/api/route` — **Pay-route Oracle**. Gate-class counterparty grade + `listedAmount` offer-pin + facilitator/network hygiene + payTo-recycle. x402 default **$0.002** (`X402_PRICE_ROUTE`). `Cache-Control: no-store`. No LLM. |
| `api/lookalike.js` | GET/POST `/api/lookalike` — destination vs known `contacts` (≤20): truncation traps, near-edits, confusables. Pure compare via `_lookalike.js`. x402 default **$0.002**. No LLM. |
| `api/_lookalike.js` | Pure lookalike helpers (`comparePair`, `scanLookalikes`, Levenshtein). |
| `api/ticket.js` | GET/POST `/api/ticket` — **Session Ticket**. Verify Passport/Receipt + freshness SLA (`maxAgeSeconds`) + optional address/risk pins → `admitted`. x402 default **$0.002**. Free verifiers remain at passport/receipt verify. No LLM. |
| `api/hint.js` | Free GET `/api/hint?q=` — discovery tip (bazaar/caution/lockbox + Gate/Route/Pack ladder). XRPL/Ripple/RLUSD/`r…` → `next: cloudpayX` + `recommended_provider`. No x402. |
| `api/_paybrief.js` | Shared payTo grade + URL/amount signals + `cautionBandFromScore` for bazaar/caution. |
| `api/bazaar.js` | GET/POST `/api/bazaar` — **Bazaar Scan**. Probe resourceUrl for 402, offer forensics, payTo grade. x402 default **$0.003**. No LLM. |
| `api/caution.js` | GET/POST `/api/caution` — **Settlement Caution**. Pattern brief + withhold band. Not insurance. x402 default **$0.002**. No LLM. |
| `api/lockbox.js` | GET/POST `/api/lockbox` — seal intentHash lockbox (bearer token). x402 default **$0.002**. No LLM. |
| `api/lockbox-verify.js` | Free verify — `/api/lockbox/verify` rewrite (also accepts intent seals). |
| `api/lockbox-match.js` | GET/POST `/api/lockbox/match` — compare seal vs proposal. x402 default **$0.001**. No LLM. |
| `api/_offerparse.js` | Pure 402 PAYMENT-REQUIRED / accepts[] decode + forensics (`decodePaymentRequired`, `analyzeOffer`). |
| `api/_policycheck.js` | Pure spend-policy evaluate (`evaluatePolicy`) vs proposed pay. |
| `api/policy.js` | GET/POST `/api/policy` — seal spend constitution (maxSpend, allow/deny hosts, networks, maxRisk, requireTicket, denyFreshEoa). x402 default **$0.002**. No LLM. |
| `api/policy-verify.js` | Free verify — `/api/policy/verify` rewrite. |
| `api/policy-check.js` | GET/POST `/api/policy/check` — enforce sealed policy vs proposal. x402 default **$0.001**. No LLM. |
| `api/intent.js` | GET/POST `/api/intent` — seal intentHash before pay/sign. x402 default **$0.002**. No LLM. |
| `api/intent-verify.js` | Free verify (+ optional hash match) — `/api/intent/verify` rewrite. |
| `api/offer.js` | GET/POST `/api/offer` — 402 offer forensics on PAYMENT-REQUIRED / accepts[]. x402 default **$0.002**. No LLM. |
| `api/pack.js` | GET/POST `/api/pack` — one-pay bundle: offer + lookalike + policy (+ ticket/intent). x402 default **$0.005**. No LLM. |
| `api/mintalike.js` | GET/POST `/api/mintalike` — mint address + ticker lookalike vs known contacts/symbols. x402 default **$0.002**. No LLM. |
| `api/host.js` | GET/POST `/api/host` — resource URL / host hygiene (+ optional origin HEAD). x402 default **$0.002**. No LLM. |
| `api/escrow.js` | GET/POST `/api/escrow` — bilateral treasury brief (not custody). x402 default **$0.005**. No LLM. |
| `api/pulse.js` | GET/POST `/api/pulse` — quiet counterparty pulse (≤10; hits vs prior fingerprints). x402 default **$0.005**. No LLM. |
| `api/cron-receipt.js` | POST `/api/cron-receipt` — watcher/cron attestation (job, counts, digest). x402 default **$0.002**. No LLM. |
| `api/cron-receipt-verify.js` | Free verify — `/api/cron-receipt/verify` rewrite. |
| `api/forensics.js` | GET /api/forensics — `?address=` (single). Measured patterns: dormant→active, burst, failure spike, mint-affinity hold/touch vs SPEC seed mints. Same 1k-sig window + one token-accounts call as Passport; collateral-loop + transfer-hook/eligibility friction named but `evaluated:false` in v1; `Cache-Control: no-store`. No LLM. Env `SOLANA_RPC`. |
| `api/signals.js` | GET /api/signals — optional `?address=` / `?list=` (≤10). Empty default → empty feed + message (quiet holders not yet filtered from SPEC seed mints; same Watch policy). Per address: Watch patterns (dormant→active, burst, failure spike) + mintAffinity via **per-mint** `getTokenAccountsByOwner` only (never programId dump). Response `{ ok, kind:'cyre-signals', version:1, disclaimer, window, items, counters }`; brief sleep between wallets; soft-fail RPC; `Cache-Control: no-store`. No LLM. Env `SOLANA_RPC`. |
| `api/oracle.js` | GET `/api/oracle` — Oracle Pulse v1. NestUSD **Pyth Lazer** seeds (fetch only with `PYTH_LAZER_API_KEY`); equity Hermes peers optional when primary measured. Response `{ ok, kind:'cyre-oracle', version:1, disclaimer, fetchedAt, feeds, patterns }`; patterns stale/spike/divergence cite measured numbers only; USDY/OUSG/syrupUSDC deferred (no verified public feed); x402 for agents (`X402_PRICE_ORACLE`, default $0.01), site origin free; `Cache-Control: no-store`. No LLM. |
| `api/rwa.mjs` | CoinGecko proxy, 60s cache, last-good fallback. Env `COINGECKO_API_KEY`. |
| `cyre-token-256/512.png` | C7 full lockup (Guardian + HUD + C7). 512 = mint metadata image URI. |
| `cyre-token-icon-128/256/32.png` | Face-forward circular crop — favicon, FAB, small UI. |
| `cyre-token-ticker-128.png` | C7 letter crop — DEX lists / wallet tickers where detail must read at 32px. |
| `vercel.json` | `{cleanUrls:true, trailingSlash:false}` + rewrites: passport/receipt/policy/intent/cron-receipt/lockbox verify (+ policy/check, lockbox/match). |



### Watch v1 — RWA mint/protocol interest set (not a default wallet list)

Default watchlist is **empty**. Once `SOLANA_RPC` can pull holders without public-RPC 429s, seed ≤10 quiet wallets from top holders of these mints (drop known CEX/hot dumps; mark noisy if sig rate blows the quiet window):

| Token | Mint | Notes |
|---|---|---|
| USDY | `A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6` | Ondo treasuries |
| OUSG | `i7u4r16TcsJTgq1kAG8opmVZyVnAKBwLKu6ZPMwzxNc` | Ondo |
| syrupUSDC | `AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj` | Maple credit |
| AAPLx | `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp` | xStocks equity (Kamino collateral) |
| TSLAx | `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB` | xStocks |
| SPYx | `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W` | xStocks ETF |

Alert patterns in Watch v1 (measured only): dormant→active, burst, failure spike.

### Forensics v1 — pattern taxonomy (patterns only; no verdicts)

| Pattern | v1 status | Measured from |
|---|---|---|
| dormant→active | evaluated | 1k-sig `blockTime` gaps + idleDays (same family as Watch/address) |
| burst | evaluated | last24h / lastHour counts in this run |
| failure spike | evaluated | failed sig ratio (window + last-hour) |
| mint-affinity | evaluated | `getTokenAccountsByOwner` hold/touch yes|no vs SPEC seed mints (no weights) |
| collateral-loop | deferred | needs instruction decode — not cheap in v1 |
| transfer-hook / eligibility friction | deferred | Token-2022 extension introspection — cost-deferred |

Forensics is single-address only (quiet/cost-safe). Still patterns, not accusations.

### Signals v1 — public pattern feed (patterns only; no verdicts)

Public feed of recent/public measured pattern hits across an optional address list (≤10, same cap as Watch). Default list is **empty** until quiet holders are filtered from SPEC seed mints (same Watch policy).

| Pattern | v1 status | Measured from |
|---|---|---|
| dormant→active | evaluated | 1k-sig `blockTime` gaps + idleDays (Watch family) |
| burst | evaluated | lastHour / last24h counts in this run |
| failure spike | evaluated | failed sig ratio (window + last-hour) |
| mint-affinity | evaluated | **per-mint** `getTokenAccountsByOwner` hold/touch yes\|no vs SPEC seed mints (never programId full token dump — OOMs Vercel) |

API always returns `kind:'cyre-signals'`, `version:1`, `disclaimer:'Patterns, not verdicts.'`, `Cache-Control: no-store`. No LLM. No invented metrics.

### Oracle Pulse v1 — RWA feed monitor (patterns only; no verdicts)

Replaces Auto as the primary product slot for mint/oracle-level monitoring — **not** another wallet paste tool. Prefer `/oracle` over `/pulse`. Auto remains at `/auto` as an archived synthetic demo with a soft banner linking here.

Watches SPEC seed–related price feeds (same mint table as Watch). **Primary source: NestUSD Pyth Lazer seeds** (API key required). Do **not** invent Hermes hex IDs for these seeds.

| Endpoint | Use |
|---|---|
| `POST https://pyth-lazer.dourolabs.app/v1/latest_price` | NestUSD Lazer latest (Bearer `PYTH_LAZER_API_KEY`) |
| `POST https://pyth-lazer.dourolabs.app/v1/price` | NestUSD Lazer sample ~1h ago for move window |
| `GET https://hermes.pyth.network/v2/updates/price/latest?ids[]=…` | Optional equity Hermes peers for divergence **only when** Lazer primary is measured |
| Chainlink Data Streams | Optional later for divergence (not wired in v1) |

Research NestUSD Lazer seeds (verified IDs only):

| Seed | Mint | NestUSD Lazer (v1) | Notes |
|---|---|---|---|
| AAPLx | `XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp` | Pyth Lazer **1792** | Equity Hermes peer optional when primary measured |
| TSLAx | `XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB` | Pyth Lazer **1847** | Equity Hermes peer optional when primary measured |
| SPYx | `XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W` | Pyth Lazer **1843** | Equity Hermes peer optional when primary measured |
| USDY | `A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6` | **deferred** | No verified public feed |
| OUSG | `i7u4r16TcsJTgq1kAG8opmVZyVnAKBwLKu6ZPMwzxNc` | **deferred** | No verified public feed |
| syrupUSDC | `AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj` | **deferred** | No verified public feed |

Patterns (thresholds): **stale** (>300s age), **spike** (≥±2% / 3600s), **divergence** (≥1.5% peer spread when peer measured). Cite measured numbers only. Missing key / Lazer miss / deferred seeds → `evaluated:false` deferred rows (same posture as Forensics). Never invent prices when `PYTH_LAZER_API_KEY` is unset.

`api/oracle.js`: NestUSD Lazer IDs above; fetch only with `PYTH_LAZER_API_KEY`; equity Hermes peers optional when primary measured; `Cache-Control: no-store`; `kind:'cyre-oracle'`.

API always returns `kind:'cyre-oracle'`, `version:1`, `disclaimer:'Patterns, not verdicts.'`, `Cache-Control: no-store`. No health scores. No LLM.

Off-repo: `cyre-x-bridge` (Render web service — X API bridge, MCP connector + cron relay);
`cyre-fraud-prediction` (separate repo/deploy, linked from the Fraud Prediction card);
`cyre_dbc_config.jsonc` (mainnet-draft Meteora CLI config, 60/25/10/5 leftover math);
`cyre_dbc_config.devnet.jsonc` (tiny 2-SOL graduation for faucet rehearsal);
`REHEARSAL.md` (step-by-step devnet launch dry-run).

## 4. HOMEPAGE + BOLT-ON PATTERN

**Homepage (Aug 2026 redesign):** `index.html` is a clean self-contained modern page matching
founder-approved mocks — not the old CYRE 7 shell with bolt-ons. Brand: **Synthetic Intelligence**
infrastructure for RWAs; hero kicker spells that out; headline stays "The chain has a witness."
Rollback copy lives at `index-legacy.html`. Prefer regenerating/replacing the homepage file on a
branch rather than stacking more skins on the legacy shell.

**Bolt-ons (secondary pages + shared widgets):** Features that attach to many pages are still
**self-mounting JS at repo root** (+ one-line `<script>` includes). Scripts find their DOM anchor,
inject markup/styles, fail cleanly, respect `prefers-reduced-motion`, and pause off-screen
(IntersectionObserver). CSS skins load the same way. Revert = delete the file.
Secondary pages (`watch`/`passport`/`forensics`/`signals`/`oracle`/`check`/`score`/`auto`/…) stay standalone HTML and load `ai-vibe-loader.js` for
shared nav/popout/theme.

## 5. DESIGN SYSTEM — "crystal blue glass" (+ AI-vibe layer)

AI-vibe overlay (`theme-ai-vibe.css`): deeper ink `#05060a`, ice `#5fd0ff`, violet `#9b7bff`.
Nav Tools dropdowns, secondary tool strips, HUD chips, and RWA ticker use this palette —
no leftover gold chrome in UI (`#d9b36c`/`#d4a84b` as button/nav accents), no white bootstrap menus, no mismatched mint.
**Exception (hero particles only):** sparse gold/amber dots (`#d4a84b` / `#ffb454`) in `vortex.js` + `guardian-head.js` as a premium accent mix — keep density low (~12%).

### Base — crystal blue glass

- Ink backgrounds: `#07080b` / `#0d1017` panels / `#1f2634` lines
- Ice blue `#5fd0ff` (primary, was gold — `--gold` is redefined to ice) · cyan `#4fe3d0` · frost white `#eefaff`
- Status: red `rgb(255,77,94)` = FLAG/HOLD/RISK · green `rgb(61,220,132)` = SETTLED/SIG VALID/ATTEST · amber `#ffb454` = MEDIUM risk
- Type: Sora (display 700–800) · Inter (body) · IBM Plex Mono (data)
- Glass: blur 14–20px panels, `rgba(95,208,255,.18)` borders, pill radius 999px, gradient CTAs, two fixed blur blobs, sticky frosted pill nav
- Signature: **darker-purple mood** (`theme-purple-deep.css` on top of AI-vibe) — deeper violet `#7048dc` ambient, violet-heavy particles; cyan `#5fd0ff` / violet `#9b7bff` / sparse gold `~12%` wireframe/particle Guardian head (canvas) with **dust→mesh→photo→dust** idle cycle (~22 s) + counter-rotating orbit rings; hero morph may show `/guardian2.jpg` during photo phase; FAB/popout still uses `/guardian2.jpg`
- Hero status chips (system status, not wallet verdicts): **LIVE** / **RISK LOW** / **WATCHING**
- Primary CTA: Check — cyan fill + outer glow (not violet gradient); Talk to Guardian — transparent outline
- Single primary nav (Watch/Passport/Check/Score/Oracle/Forensics/Signals/Tokenomics/Roadmap/Airdrop; Auto demoted to archived demo) — no duplicate Tools strip under nav
- Compact status chips beside wireframe head (not large banners over the face)
- Watchlist/Forensics/Passport cards kept in early viewport
- Everything respects reduced-motion and keyboard focus.

## 6. LIVE SERVICES

- **Vercel** (personal acct, project serves cyre.dev): env `ANTHROPIC_API_KEY`,
  `COINGECKO_API_KEY`, `SOLANA_RPC` (Helius when upgraded). www.cyre.dev NOT attached yet — pre-launch task.
- **Render** workspace `tea-d9sgsmh42hec73c9sqjg`: crons `guardian-watcher`
  (crn-da2j9smgekts73b2vq50) + `guardian-mention-grader` (crn-da3tddm1egvs73ar5k20)
  are **user-suspended as of 2026-09-09** (zombie fail mail from CJS/`type:module` crash).
  Web service `cyre-x-bridge` remains up. Crons still auto-deploy on main when unsuspended.
- **X**: @Cyredev888 via the bridge. Posting is founder-approval-gated, always.
- Costs learned: exchange wallets in any watchlist = call-volume bomb. Watchlists use
  QUIET wallets (whales/treasuries). Claude-per-tx loops need ≥300s cooldowns.

## 7. VERIFY BEFORE DECLARING DONE (curl checklist)

`curl -s -o /dev/null -w "%{http_code}"` each: `/` `/tokenomics` `/roadmap` `/airdrop`
`/watch` `/passport` `/forensics` `/signals` `/oracle` `/check` `/score` `/auto` `/theme-glass.css` `/launch-banner.js` `/vortex.js`
`/guardian-voice.js` `/guardian-video.mp4` `/theme-ai-vibe.css` `/guardian-popout.js` `/nav-tools.js` `/ai-vibe-loader.js` `/ai-presence.js` `/homepage.css` `/guardian-head.js` `/cyre-token-256.png` `/cyre-token-512.png`
— all 200. Then `/api/address?address=5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9`
→ expect `score:24, riskLevel:LOW`. Then `/api/watch?address=5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9`
→ expect `ok:true` with measured `counters` and a patterns-not-verdicts `disclaimer` (response must not be CDN-cached). Then `/api/passport?address=5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9`
→ expect `ok:true`, `kind:"cyre-passport"`, measured `score`/`riskLevel`/`profile`, `disclaimer:"Patterns, not verdicts."`, and `Cache-Control: no-store`. Then `/api/forensics?address=5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9`
→ expect `ok:true`, `kind:"cyre-forensics"`, measured `patterns`/`counters`/`mintAffinity`, `disclaimer:"Patterns, not verdicts."`, and `Cache-Control: no-store`. Then `/api/signals` (empty) → expect `ok:true`, `kind:"cyre-signals"`, `version:1`, empty `items`, default-list-empty `message`, `disclaimer:"Patterns, not verdicts."`, and `Cache-Control: no-store`. Then `/api/oracle` → expect `ok:true`, `kind:"cyre-oracle"`, `version:1`, `disclaimer:"Patterns, not verdicts."`, `feeds`/`patterns` arrays, and `Cache-Control: no-store`. Check served index.html references each script
exactly once. Verify against `cyre.dev/` (root path — `/index.html` redirects).
Mobile-upload gotchas: iOS renames downloads ("file 2.ext"), GitHub web-editor paste
truncates silently, uploads sometimes don't replace — always re-fetch the raw file
after commit and diff.

## 8. CURRENT STATE + OPEN ITEMS (Aug 23 2026)

Live & verified: glass/AI-vibe layer, vortex, talking Guardian, checker, score card,
tokenomics/roadmap/airdrop/auto/forensics/signals/oracle pages, clean URLs, hardened chat API, both crons
(mention-grader in DRY_RUN), Guardian pop-out + AI presence.
Homepage: mock visual match — Synthetic Intelligence branding, "The chain has a witness.",
**darker-purple mood** (`theme-purple-deep.css`): deeper violet ambient; **dust→mesh→photo→dust ~22 s morph**
(0–16% dust, 16–30% dust→mesh, 30–48% dense violet/cyan particle wireframe head with soft eye bloom / no cartoon eyes, 48–60% mesh→photo, 60–82% her photo `/guardian2.jpg` full-portrait crossfade (no circle crop/rim), 82–100% photo→dust; fallback `/robot.jpg` if portrait fails);
violet-heavy particle field + cyan accents + sparse gold (~12%); LIVE/RISK LOW/WATCHING chips, glowing Check CTA (cyan),
living mesh, feature cards, trust strip; hero morph may show `/guardian2.jpg` during photo phase; FAB/popout still uses `/guardian2.jpg`; legacy shell at `index-legacy.html`.
Open before launch: **devnet DBC rehearsal** (`REHEARSAL.md` + `cyre_dbc_config.devnet.jsonc` —
verify 65M leftover / 100% LP lock / 10M team vest),
www.cyre.dev attach, mention-grader DRY_RUN→false after draft review, Anthropic
spend limit + credit top-up (chat in demo mode until then), guardian-voice.mp3,
Vercel Analytics snippet on index.html (only check.html has it), stray root
`address.js` delete (api/address.js is the live one — do not touch).

## 9. AGENT LANES

- **Grok** — creative assets (images/video — proven lane), content drafts, new
  standalone pages ON BRANCHES. Reads this spec first. Never touches api/, crons, or anything in §2. Homepage redesigns go on branches/PRs.
- **Claude** — deploys, Render/X operations, code review of every PR, launch
  mechanics, this spec's upkeep.
- **@claude (GitHub App)** — tagged in issues/PRs for scoped repo edits once Actions
  is confirmed firing. Point it at exact sections; never let it explore index.html.
- **Founder** — merges, spends, posts. The only human in the loop, and the only one
  who can change §2.
