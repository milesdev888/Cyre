# B402 / BNB Chain lane — Part 1 research

Sources (Binance Open API docs, Aug 2026):

- [Quick Start](https://developers.binance.com/en/docs/products/onchainpay-x402/quick-start.md)
- [Integration Guideline](https://developers.binance.com/en/docs/products/onchainpay-x402/integration-guideline.md)
- [Apply partner developer account](https://developers.binance.com/en/docs/products/onchainpay-x402/basics/6.apply-developer-account.md)
- [Environments and API base URLs](https://developers.binance.com/en/docs/products/onchainpay-x402/basics/4.base-urls.md)
- [API request signing](https://developers.binance.com/en/docs/products/onchainpay-x402/basics/3.request-signing.md)
- [Common request headers](https://developers.binance.com/en/docs/products/onchainpay-x402/basics/1.common-request-headers.md)
- [Supported payment methods](https://developers.binance.com/en/docs/products/onchainpay-x402/basics/9.supported-payment-methods.md)
- [Get Supported Configurations V2](https://developers.binance.com/en/docs/products/onchainpay-x402/open-apis-v2/1.get-supported-configurations.md)
- [Verify Payment V2](https://developers.binance.com/en/docs/products/onchainpay-x402/open-apis-v2/2.verify-payment.md)
- [Settle Payment V2](https://developers.binance.com/en/docs/products/onchainpay-x402/open-apis-v2/3.settle-payment.md)
- [Permit2 signing guide](https://developers.binance.com/en/docs/products/onchainpay-x402/open-apis-v2/4.permit2-signing.md)
- [B402 Bazaar](https://developers.binance.com/en/docs/products/onchainpay-x402/b402-bazaar.md)

---

## 1. Merchant onboarding (human steps)

Sandbox and Production are **separate accounts**. Credentials are **not shared**.

### What the owner does in a browser / offline

1. Open the partner application form: https://forms.gle/aUQvxUETfGMzyTky5  
2. Apply **once for Sandbox**, then again for Production when ready.
3. Per environment, submit:
   - Business / brand name  
   - Contact email  
   - **Wallet address (0x…)** to receive funds (testnet wallet for Sandbox, mainnet for Production)  
   - **RSA public key** (Base64 DER) — generate locally (see §2)  
   - **Server IP addresses** for whitelist  
   - Optional webhook callback URL  
4. Wait for Binance to complete configuration.
5. Receive per environment:
   - `clientId`  
   - `accessToken` (sign access token)  
   - Binance webhook public key (if using webhooks)  
   - **Authenticated API `{BASE_URL}`** (docs say “please contact us for access” — handed out with credentials so sandbox keys cannot hit production)

### Recommended order

Sandbox first → integrate → Production credentials → go live.

### What is *not* enough

A Binance.com retail account alone is not documented as sufficient. You need the **partner developer** path above (form + RSA + IP allowlist + issued `clientId` / `accessToken` / base URL).

---

## 2. Auth on facilitator calls (verify / settle / supported)

Authenticated surface: `{BASE_URL}/papi/v2/b402/{supported|verify|settle}`

### Headers (every request)

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `X-Tesla-ClientId` | issued `clientId` |
| `X-Tesla-SignAccessToken` | issued `accessToken` |
| `X-Tesla-Timestamp` | Unix **milliseconds** string |
| `X-Tesla-Signature` | Base64 RSA-SHA256 signature |

### Signature scheme

1. Generate **1024-bit RSA** key pair once; submit **public** key at onboarding; keep PKCS#8 DER Base64 private key as secret.  
2. Per request: payload to sign = **exact request body UTF-8 bytes** + **timestamp string** (same value as `X-Tesla-Timestamp`).  
3. Sign with **SHA256withRSA**; Base64-encode.  
4. Server rejects timestamps more than **5 minutes** skewed.

Node sketch (matches docs):

```js
const timestamp = Date.now().toString();
const toSign = body + timestamp;
const privateKey = crypto.createPrivateKey({ key: Buffer.from(PRIV_KEY_B64, 'base64'), format: 'der', type: 'pkcs8' });
const signature = crypto.createSign('SHA256').update(toSign, 'utf8').sign(privateKey, 'base64');
```

Unlike CDP (`Authorization: Bearer <JWT>` to `api.cdp.coinbase.com`), B402 uses **Tesla-named headers + RSA body+timestamp signing**. Source IP must be on the merchant whitelist.

Public Bazaar discovery (`/bazaar/*`) needs **no** auth.

---

## 3. Wire shape vs CDP

### Request (verify & settle) — same family as CDP x402 v2

Top-level:

```json
{
  "x402Version": 2,
  "paymentPayload": { "...": "..." },
  "paymentRequirements": { "...": "..." }
}
```

Settle adds optional `settleAmount` (string, atomic) **only for `permit2-upto`**.

`paymentPayload` (V2):

- `x402Version: 2`
- `resource` (optional object: `url`, `description`, `mimeType`)
- `accepted` — chosen `PaymentRequirements` (scheme, network, amount, asset, payTo, maxTimeoutSeconds, **extra**)
- `payload` — either EIP-3009 `authorization` **or** Permit2 `permit2Authorization` + `signature`
- `extensions` — optional; put `extensions.bazaar` here for Bazaar indexing on settle

### Differences that matter for Guardian

| Topic | CDP / our current Base lane | B402 V2 |
|---|---|---|
| Facilitator auth | CDP JWT Bearer | RSA + `X-Tesla-*` headers |
| Facilitator URL | Public (`api.cdp.coinbase.com/...` or x402.org) | Private `{BASE_URL}` from onboarding |
| Verify response | `{ isValid, invalidReason?, ... }` | Wrapped Binance envelope often; data has `isValid` / `invalidReason` (and `invalidMessage` only for some structural errors) |
| Settle response | `{ success, ... }` | `{ success, transaction, payer, network, amount?, errorReason? }` — **async**: `success:false` + non-empty `transaction` means keep polling idempotent `/settle` |
| `extra` | Often `{ name, version }` for EIP-3009 USDC | **Required**: `name`, `version`, `assetTransferMethod`, `signerAddress`, and for permit2 `spenderAddress` — **copy verbatim from `/supported`** |
| Scheme | We advertise `exact` | `exact` or `upto` (upto ↔ permit2-upto) |
| Bazaar | `extensions.bazaar` on 402 / settle | Same CDP-compatible blob inside `paymentPayload.extensions.bazaar` on settle |

Our existing `callFacilitator(base, '/verify'|'/settle', { x402Version, paymentPayload, paymentRequirements })` shape is **compatible** if:

1. Auth headers switch for the BSC lane  
2. `extra` is enriched from `/supported` (or cached env)  
3. Settle success handling allows **poll** when `transaction` is non-empty and `success` is false  

---

## 4. Payment requirements for BSC

### Networks

| Env | CAIP-2 | Chain ID |
|---|---|---|
| Production | `eip155:56` | 56 |
| Sandbox | `eip155:97` | 97 |

### Methods

| Method | Scheme in accepts | Tokens |
|---|---|---|
| `eip3009` | `exact` | **U and USD1 only** |
| `permit2-exact` | `exact` | Any ERC-20 (incl. USDT, USDC) |
| `permit2-upto` | `upto` | Any ERC-20 |

Binance agent-wallet examples and docs lean on **USDT on BSC** via **permit2** for generic ERC-20. USDC on BSC mainnet is **permit2-*** only in the `/supported` examples (no eip3009 for USDC).

### Mainnet tokens (`eip155:56`) — all **18 decimals**

| Token | Address | Decimals |
|---|---|---|
| U | `0xcE24439F2D9C6a2289F741120FE202248B666666` | 18 |
| USD1 | `0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d` | 18 |
| USDC | `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d` | 18 |
| USDT | `0x55d398326f99059fF775485246999027B3197955` | 18 |

**Amount encoding:** $0.005 = `5 * 10^15` atomic = `"5000000000000000"` (not Base’s 6-decimal `"5000"`).

### Testnet tokens (`eip155:97`)

| Token | Address | Decimals | Notes |
|---|---|---|---|
| Mock U | `0x330949Aed7d00FCe0558C64ED6FeC9792616cC39` | 6 | Mint yourself |
| USDC | `0xEC1C60D64a06896Df296438c12edD14E974FDE47` | 6 | BNB Chain faucet |
| USDT | `0x337610d27c682E347C9cD60BD4b3b107C9d34dDd` | 18 | BNB Chain faucet |

### `extra` fields (must forward from `/supported`)

```json
{
  "name": "Tether USD",
  "version": "1",
  "assetTransferMethod": "permit2-exact",
  "signerAddress": "<facilitator EOA from /supported>",
  "spenderAddress": "<Permit2 proxy from /supported>"
}
```

Permit2 contract (mainnet + testnet): `0x000000000022D473030F116dDEE9F6B43aC78BA3`

**Guardian default recommendation for dormant lane:** advertise **USDT + `permit2-exact` + `eip155:56`**, with `extra` filled from a cached `/supported` kind (or env overrides for signer/spender until `/supported` is called at boot). Prefer USDT over USDC because Binance’s own buyer tooling examples highlight USDT on BSC and agent-wallet `assetTransferMethod: permit2` for that asset.

---

## 5. Sandbox

| Item | Value |
|---|---|
| Chain | BSC Testnet |
| Chain ID / CAIP-2 | 97 / `eip155:97` |
| Authenticated base URL | **Provided by Binance on Sandbox onboarding** (“contact us” — not public in docs) |
| Public Bazaar (prod) | `https://www.binance.com/bapi/ramp/v1/public/ramp/b402` |
| Public Bazaar (sandbox) | Contact Binance |
| Faucet / mints | Mock U self-mint; USDC/USDT via BNB Chain faucet (see supported-payment-methods) |
| Bazaar indexing | Only **confirmed** V2 settles with `extensions.bazaar` index (~30s). Failed / timed-out settles do **not** count. Sandbox settles should not be treated as Production Bazaar inventory (separate env / catalog). |

---

## Implications for dormant Guardian lane

- Lane implementation is **already on `main`** (PR #118). It stays **off** until `X402_PAY_TO_BSC` is set — Base/Solana unchanged when unset.  
- **Do not call Binance from Vercel** — no fixed egress IP. Route verify/settle/supported through the Render relay (`cyre-fraud-prediction` `/internal/b402/*`). See `docs/B402-RELAY.md` in that repo.  
- Vercel never holds `B402_*` secrets; only `X402_INTERNAL_KEY` to the relay.  
- Convert USD list prices to **18-decimal** atomic amounts on mainnet USDT/USDC.  
- `extra` comes from relay `/supported` (cached) or explicit signer/spender env fallbacks — never guess.  
- Owner action when Sandbox credentials arrive: RSA → Render static IPs → `B402_*` on Render → `X402_PAY_TO_BSC` on Vercel (no further code merge required for the lane itself).
