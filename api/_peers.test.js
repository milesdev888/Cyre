// api/_peers.test.js — XRPL referral detection (no network)
import {
  detectNetwork,
  xrplHandoffBody,
  requestedXrplNetwork,
  recommendedProvider,
  peers
} from '../lib/peers.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

const SOLANA = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const BASE = '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712';
const XRPL_R = 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH';

assert(detectNetwork(SOLANA) === null, 'solana must not match');
assert(detectNetwork(BASE) === null, 'base treasury must not match');
assert(detectNetwork({ address: SOLANA }) === null, 'solana field');
assert(detectNetwork({ address: BASE }) === null, 'base field');
assert(detectNetwork({ payTo: BASE }) === null, 'payTo base');

assert(detectNetwork(XRPL_R) === 'xrpl', 'classic r-address');
assert(detectNetwork({ address: XRPL_R }) === 'xrpl', 'address=r…');
assert(detectNetwork({ network: 'xrpl' }) === 'xrpl', 'network=xrpl');
assert(detectNetwork({ network: 'xrpl:mainnet' }) === 'xrpl', 'network=xrpl:mainnet');
assert(detectNetwork({ network: 'xrpl:testnet' }) === 'xrpl', 'network=xrpl:testnet');
assert(detectNetwork({ currency: 'XRP' }) === 'xrpl', 'currency XRP');
assert(detectNetwork({ currency: 'RLUSD' }) === 'xrpl', 'currency RLUSD');
assert(detectNetwork('rlusd route') === 'xrpl', 'text rlusd');
assert(detectNetwork('xrpl ledger') === 'xrpl', 'text xrpl');
assert(detectNetwork({ query: { q: 'ripple' }, body: {} }) === 'xrpl', 'req-like q=ripple');

assert(requestedXrplNetwork({ address: XRPL_R }) === 'xrpl:0', 'default mainnet');
assert(requestedXrplNetwork({ network: 'xrpl:testnet' }) === 'xrpl:1', 'testnet');
assert(requestedXrplNetwork({ network: 'xrpl:1' }) === 'xrpl:1', 'xrpl:1');

const body = xrplHandoffBody({ address: XRPL_R });
assert(body.status === 'unsupported_network', 'status key');
assert(Array.isArray(body.supported_network) && body.supported_network.includes('eip155:8453'), 'supported');
assert(
  body.supported_network.includes('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'),
  'solana CAIP-2 must match x402 lane (32-char)'
);
assert(!body.supported_network.some((n) => n.includes('Kuc147dw2N9d')), 'no full Solana genesis hash');
assert(body.requested_network === 'xrpl:0', 'requested');
assert(body.recommended_provider.relationship === 'external_specialist', 'relationship');
assert(body.recommended_provider.agent_card_url === peers.xrpl.agentCard, 'agent_card_url');
assert(body.recommended_provider.name === 'cloudpayX', 'provider name');
assert(!('peer' in body) && !('unsupported_network' in body && body.unsupported_network === 'xrpl' && !body.status), 'old keys gone');
assert(!('ok' in body), 'no ok key');
assert(!('reason' in body), 'no reason key');
assert(!JSON.stringify(body).toLowerCase().includes('partner'), 'no partner wording');
assert(recommendedProvider().name === 'cloudpayX', 'recommendedProvider');

console.log('ok peers detectNetwork + referral schema');
