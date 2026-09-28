# SWAP-SPEC.md — Guardian Protected Swap
### cyre.dev/scan → scan first, swap second
Version 1.0 · Aug 24, 2026

---

## 1. WHAT WE ARE BUILDING

One page, two halves:

```
┌──────────────────────────────┐
│  GUARDIAN TOKEN SCAN         │  ← already live (phase 1)
│  paste mint → fact report    │
├──────────────────────────────┤
│  [ Proceed to swap ]         │  ← unlocks ONLY after a scan
├──────────────────────────────┤
│  JUPITER PLUGIN (embedded)   │  ← phase 2, this spec
│  user's wallet, our fee bps  │
└──────────────────────────────┘
```

The pitch in one line: **every other swap lets you buy blind — ours
makes you look first.**

---

## 2. NON-NEGOTIABLES (the constitution)

1. **Non-custodial, always.** We never hold funds, keys, or seed
   phrases. The user's own wallet (Phantom etc.) signs every
   transaction inside Jupiter's widget. CYRE ships static HTML + one
   read-only API. There is nothing on our side worth hacking.
2. **Patterns, not verdicts.** The unlock button says
   `Proceed to swap` — never "Safe to buy," "Approved," or a green
   checkmark implying endorsement. A HIGH-risk scan does NOT block
   the swap; it makes the user click through an explicit
   "I've read the signals above" confirmation. Inform, never decide.
3. **Scan-before-swap is the product.** The widget never renders
   before a completed scan of the exact output token. If the user
   changes the output token inside the widget, the gate re-arms
   (see §6).
4. **No custom swap code.** We embed Jupiter's audited, open-source
   Plugin. We do not build our own transaction construction, ever.
   Our surface area = UI + the read-only scan API that already exists.

---

## 3. ARCHITECTURE

| Piece | What | Where |
|---|---|---|
| Scan API | `api/token.js` (live) | Vercel serverless, read-only RPC |
| Scan UI | `scan.html` (live) | static |
| Gate + swap | `scan-swap.js` | static |
| Config | `swap-config.js` | static — referral pubkey filled after Jupiter dashboard |
| Swap widget | Jupiter Plugin, "integrated" mode | rendered into `<div id="jup">` on scan.html |
| Wallet | user's own (Phantom/Solflare/etc.) | handled entirely by Jupiter |
| Fee route | Jupiter Referral account | on-chain, claimable by treasury wallet |

No new backend. No database. No user accounts.

Note: Jupiter renamed Terminal → **Plugin**. Same product: script tag
+ `window.Jupiter.init()`. Pull the exact current snippet from the
Plugin Playground at dev.jup.ag at build time — it auto-generates
integration code, and the script URL / prop names have changed
between versions before.

Script URL in use: `https://plugin.jup.ag/plugin-v1.js`

---

## 4. REVENUE — the platform fee

Jupiter charges no protocol fee but lets integrators add one, set in
basis points and tracked through their Referral Dashboard.

- **Our fee: 50 bps (0.5%)** of output token. Rationale: 20 bps is
  invisible, 100 reads greedy for an unknown brand; 50 is standard
  for a value-added front end. Revisit after volume exists.
- Setup (one-time, at the computer):
  1. Create a referral account in Jupiter's Referral Dashboard,
     signed by the **treasury wallet** — fees accrue to it directly.
  2. Put the referral account pubkey in `swap-config.js` → `referralAccount`.
  3. Fees are claimed from the dashboard whenever; disclose claims
     the same way tokenomics movements are disclosed.
- The fee is shown to the user in the UI footer:
  `CYRE routes swaps through Jupiter and adds a 0.5% platform fee.`
  Hidden fees are how trust dies; ours is a line item.

---

## 5. PAGE FLOW (user's eye view)

1. Paste mint → **Scan** (existing).
2. Report renders. Below it, a new CTA block:
   - LOW / MEDIUM: `[ Proceed to swap ]`
   - HIGH: red framing + checkbox `I've read the signals above` →
     button enables. Never blocked, always informed.
3. Click → Jupiter Plugin mounts in integrated mode, prefilled:
   - `outputMint` = the scanned token (fixed — see §6)
   - `inputMint` = SOL default
   - branding: CYRE name + C7 logo URI (Plugin supports branding config)
4. User connects their wallet inside the widget, swaps, signs.
   We are spectators from step 4 on.
5. After the widget mounts, a persistent one-liner stays visible:
   `Scanned <mint-short> at <time>. Patterns, not verdicts — the trade is yours.`

---

## 6. THE GATE (the only real engineering)

State machine on scan.html:

```
IDLE ──scan ok──▶ SCANNED(mint) ──click──▶ SWAP(mint)
   ◀──────────── any new scan / mint change ─────────┘
```

- `SWAP` is only reachable from `SCANNED` and carries the scanned
  mint with it.
- Widget initialises with the output mint **fixed** (`fixedMint` in
  formProps) so the user cannot sidestep the scan by switching tokens
  inside the widget. To swap a different token: scan it.
- Scan results are cached max 60s server-side already; the client
  gate also expires after 10 minutes — stale scan → re-scan before
  swap re-enables.
- If the user changes output mint inside the widget, `onFormUpdate`
  re-arms the gate (widget closes, proceed disabled until re-scan).

---

## 7. COPY LAW (extends the existing claims-safe rules)

Never: "safe", "approved", "verified token", "rug-proof",
"protected" as a guarantee, APY/return language, "can't lose".
Always: "scanned", "signals", "patterns", "on-chain facts",
"the decision stays yours".
Required on page: the existing disclaimer block + fee disclosure +
"CYRE never DMs you or asks you to connect a wallet anywhere but
this page."

## 8. LEGAL POSTURE (plain English, not legal advice)

Non-custodial embed of a third-party router, no fiat, no custody, no
order matching by us = the standard defensible interface model. The
platform fee is an interface fee, not a brokerage. Two rules keep it
that way: never take custody, never route around Jupiter with our own
transaction code. If this grows real volume, spend an hour with a
crypto attorney before adding anything beyond this spec.

---

## 9. BUILD ORDER (phase 2, ~one session at the computer)

1. Referral account via Jupiter dashboard (treasury wallet signs).
2. Paste referral pubkey into `swap-config.js`.
3. Gate state machine wired in `scan-swap.js` (§6).
4. Fee disclosure + persistent scan reminder line (§5, §7).
5. Test on a throwaway wallet with $5: LOW token swap, HIGH token
   click-through, mint-switch re-arm, 10-min expiry, mobile Safari
   + Phantom in-app browser (most degens swap from the phone).
6. Ship, then announce: "the swap that makes you look first."

## 10. EXPLICITLY OUT OF SCOPE

- Our own routing/transaction code (never)
- Custody, balances, accounts, KYC (never — that's an exchange)
- Limit orders, DCA, perps (Jupiter offers some — later, maybe)
- Auto-blocking HIGH tokens (we inform; adults decide)
- $C7 anywhere in the swap until it exists on mainnet
