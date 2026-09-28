<!-- DRAFT — do not post until reviewed. Target: https://github.com/x402-foundation/x402/issues/2112 -->

## CYRE Guardian — same symptom on CDP facilitator (Base mainnet)

Adding another reproduction: successful CDP settles with the Bazaar extension present on the 402 and echoed in the buyer payload, but **no `EXTENSION-RESPONSES` header** and **still not indexed** in CDP discovery / Agentic Market.

### Service

| Field | Value |
|---|---|
| Resource | `https://cyre.dev/api/address` |
| Host | `cyre.dev` (Vercel) |
| x402 version | **2**, scheme `exact` |
| Facilitator | CDP `https://api.cdp.coinbase.com/platform/v2/x402` (JWT with `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET`) |
| Network | `eip155:8453` (Base mainnet) |
| Asset | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Amount | `5000` atomic ($0.005) |
| payTo | `0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712` (CDP-provisioned treasury) |
| serviceName | `CYRE Guardian` |

### What we send

- **402 challenge** includes `extensions.bazaar` (GET discovery info + JSON Schema) and a v2 `resource` object (`url`, `description`, `mimeType`, `serviceName`, `tags`, `iconUrl`).
- Buyer (Coinbase `CdpX402Client` / `@x402/core`) echoes `extensions.bazaar` into the `PAYMENT-SIGNATURE` payload.
- Server forwards the client-signed `payment.accepted` to CDP `/verify` then `/settle` after pinning `scheme` / `network` / `asset` / `payTo` (and min amount) against our lane offer.

### Settlements

| Note | Tx |
|---|---|
| Confirmed Base settle | `0x01b761fa9daa661bbf1cd34cfe32d245fb5aae0287d483bb360cff30dc389bb5` |
| Earlier settle (same resource / payTo) | _TODO: paste second hash if distinct from above_ |

Both paths returned a successful settle (`PAYMENT-RESPONSE` with success) from our side. **`EXTENSION-RESPONSES` was not present** on the client-visible response (and we did not observe a bazaar cataloging ack).

### Discovery status (checked repeatedly)

```bash
# CDP
curl -s "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?payTo=0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712"

# Agentic Market
curl -s "https://api.agentic.market/v1/services/search?q=cyre"
```

- Full CDP catalog scan (~14.8k resources): **0** matches for `cyre.dev` / `CYRE Guardian` / our `payTo`.
- Agentic Market search for `cyre` / `cyre.dev` / `https://cyre.dev/api/address`: **0** hits.

Happy to share a redacted verify/settle request body or a HAR if useful. This looks like the same missing-index / missing-`EXTENSION-RESPONSES` behavior described in this issue.
