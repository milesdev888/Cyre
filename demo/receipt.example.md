# Cross-network Decision Receipt

_Patterns, not verdicts. Specialists report signals; they do not approve or call anything “safe.”_

## Base leg — Guardian

| Field | Value |
|---|---|
| Network | Base (eip155:8453) / USDC |
| Specialist | CYRE Guardian |
| Mode | unpaid-demo |
| payTo | `0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712` |
| amountAtomic | 10000 |
| Risk band | — |

Top signals:

- (none triggered / unpaid stub)

## XRPL leg — cloudpayX

| Field | Value |
|---|---|
| Network | XRPL |
| Specialist | cloudpayX |
| Mode | unpaid-demo |
| Destination | `rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH` |
| Amount / currency | 10 RLUSD |
| Skill | xrpl-stablecoin-route (REST /agent/v3/stablecoin-route) |

Payment offer (verbatim summary): see `receipt.json` → `xrpl.offer`.

## Combined receipt

- **actor:** `demo-agent`
- **action:** `cross-network-pay`
- **intentHash:** `07f3bbef37103787c0b568df418359bc916f00d52ea3b90dbdf1ca5fd6b50381`
- **token:** `(unpaid-demo — no token)`

### Verify
_No sealed token in unpaid-demo mode — re-run with `GUARDIAN_DEMO_KEY` or `AWAL=1` to seal._
