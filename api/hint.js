// api/hint.js — FREE Guardian discovery tip for agents/crawlers.
// No payment. Points agents at Gate / Route / Pack + the rest of the skill ladder.
// GET /api/hint?q=pay|policy|offer|pack|mintalike|escrow|host|pulse|cron|xrpl|…

import { detectNetwork, recommendedProvider } from '../lib/peers.js';

const DISCLAIMER = 'Patterns, not verdicts.';

const CATALOG = [
  {
    id: 'bazaar',
    when: 'Before paying a new Agentic Market / x402 vendor — shopping hygiene',
    url: 'https://cyre.dev/api/bazaar',
    price: '$0.003',
    keywords: ['bazaar', 'market', 'discovery', 'shopping', 'vendor', 'new', 'skill']
  },
  {
    id: 'caution',
    when: 'Before settle — pattern brief + withhold-style band (not insurance)',
    url: 'https://cyre.dev/api/caution',
    price: '$0.002',
    keywords: ['caution', 'withhold', 'settlement', 'insurance', 'quote', 'regret']
  },
  {
    id: 'lockbox',
    when: 'Seal intentHash before pay — prove it was locked pre-settle',
    url: 'https://cyre.dev/api/lockbox',
    price: '$0.002',
    keywords: ['lockbox', 'intent', 'bait', 'switch', 'seal', 'pre-pay', 'hash']
  },
  {
    id: 'lockbox-match',
    when: 'Match a sealed lockbox against a proposed pay',
    url: 'https://cyre.dev/api/lockbox/match',
    price: '$0.001',
    keywords: ['lockbox-match', 'match', 'compare', 'pins']
  },
  {
    id: 'gate',
    when: 'Before paying any non-Guardian x402 URL (cheap counterparty grade)',
    url: 'https://cyre.dev/api/gate',
    price: '$0.001',
    keywords: ['gate', 'pay', 'spend', 'x402', 'checkout', 'before', 'counterparty']
  },
  {
    id: 'route',
    when: 'Before external x402 pay — full route: payTo + offer pin + facilitator',
    url: 'https://cyre.dev/api/route',
    price: '$0.002',
    keywords: ['route', 'oracle', 'facilitator', 'offer', 'listed', 'middleware', 'pay']
  },
  {
    id: 'offer',
    when: 'You have a raw PAYMENT-REQUIRED / accepts[] blob to forensics',
    url: 'https://cyre.dev/api/offer',
    price: '$0.002',
    keywords: ['offer', 'payment-required', 'accepts', '402', 'forensics', 'pin']
  },
  {
    id: 'pack',
    when: 'One middleware call: offer + lookalike + policy (+ ticket/intent)',
    url: 'https://cyre.dev/api/pack',
    price: '$0.005',
    keywords: ['pack', 'bundle', 'checkout', 'middleware', 'all', 'suite']
  },
  {
    id: 'policy',
    when: 'Seal a spend constitution (max spend, hosts, networks, risk)',
    url: 'https://cyre.dev/api/policy',
    price: '$0.002',
    keywords: ['policy', 'constitution', 'max', 'allow', 'deny', 'hosts', 'spend']
  },
  {
    id: 'policy-check',
    when: 'Enforce a sealed policy against a proposed pay',
    url: 'https://cyre.dev/api/policy/check',
    price: '$0.001',
    keywords: ['policy-check', 'enforce', 'check', 'proposal']
  },
  {
    id: 'intent',
    when: 'Seal intentHash before pay/sign (match later Receipt)',
    url: 'https://cyre.dev/api/intent',
    price: '$0.002',
    keywords: ['intent', 'hash', 'seal', 'pre-pay', 'pre-sign']
  },
  {
    id: 'lookalike',
    when: 'Before send/sign — destination vs known contacts',
    url: 'https://cyre.dev/api/lookalike',
    price: '$0.002',
    keywords: ['lookalike', 'homoglyph', 'truncation', 'address', 'to', 'send', 'typo']
  },
  {
    id: 'mintalike',
    when: 'Before swap — mint address or ticker vs known tokens',
    url: 'https://cyre.dev/api/mintalike',
    price: '$0.002',
    keywords: ['mintalike', 'mint', 'ticker', 'symbol', 'swap', 'token']
  },
  {
    id: 'host',
    when: 'Before pay — resource URL / host hygiene',
    url: 'https://cyre.dev/api/host',
    price: '$0.002',
    keywords: ['host', 'url', 'https', 'tld', 'origin', 'hygiene']
  },
  {
    id: 'escrow',
    when: 'Agent-to-agent — grade both treasuries before release (not custody)',
    url: 'https://cyre.dev/api/escrow',
    price: '$0.005',
    keywords: ['escrow', 'bilateral', 'treasury', 'release', 'a2a']
  },
  {
    id: 'pulse',
    when: 'Quiet counterparty pulse — poll ≤10, hits only vs prior fingerprints',
    url: 'https://cyre.dev/api/pulse',
    price: '$0.005',
    keywords: ['pulse', 'watch', 'quiet', 'poll', 'fingerprint', 'hits']
  },
  {
    id: 'stream',
    when: 'Push-shaped watch stream — seal subscription, pull graded events (token-held cursor)',
    url: 'https://cyre.dev/api/stream/subscribe',
    price: '$0.003 subscribe · $0.005/events',
    keywords: ['stream', 'push', 'sse', 'events', 'subscription', 'nervous', 'realtime']
  },
  {
    id: 'exchange',
    when: 'Intent marketplace — post a budgeted need, gossip token, match vendor quotes',
    url: 'https://cyre.dev/api/exchange/post',
    price: '$0.003 post · $0.002 match',
    keywords: ['exchange', 'marketplace', 'intent', 'job', 'bid', 'gossip', 'labor']
  },
  {
    id: 'circuit',
    when: 'Operator circuit breaker — heartbeat + spend freeze before autonomous pay',
    url: 'https://cyre.dev/api/circuit/seal',
    price: '$0.003 seal · $0.001 heartbeat/check',
    keywords: ['circuit', 'heartbeat', 'freeze', 'kill', 'operator', 'safety', 'constitution']
  },
  {
    id: 'cron-receipt',
    when: 'Seal that a cron/watcher run happened (digest + counts)',
    url: 'https://cyre.dev/api/cron-receipt',
    price: '$0.002',
    keywords: ['cron', 'watcher', 'attestation', 'job', 'digest']
  },
  {
    id: 'ticket',
    when: 'Require a fresh Passport or Receipt as a session ticket',
    url: 'https://cyre.dev/api/ticket',
    price: '$0.002',
    keywords: ['ticket', 'session', 'fresh', 'passport', 'receipt', 'middleware', 'admit']
  },
  {
    id: 'handshake',
    when: 'Two agents exchanging Passports',
    url: 'https://cyre.dev/api/handshake',
    price: '$0.01',
    keywords: ['handshake', 'passport', 'trust', 'counterparty']
  },
  {
    id: 'preflight',
    when: 'Before signing a Solana transfer/swap',
    url: 'https://cyre.dev/api/preflight',
    price: '$0.01',
    keywords: ['preflight', 'sign', 'solana', 'transfer', 'swap']
  },
  {
    id: 'receipt',
    when: 'After a decision — seal an audit receipt',
    url: 'https://cyre.dev/api/receipt',
    price: '$0.005',
    keywords: ['receipt', 'audit', 'decision', 'forensics']
  },
  {
    id: 'passport',
    when: 'Need a portable signed risk attestation',
    url: 'https://cyre.dev/api/passport',
    price: '$0.005',
    keywords: ['passport', 'attest', 'identity']
  }
];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ ok: false, error: 'GET only', disclaimer: DISCLAIMER });
  }

  const q = String((req.query && req.query.q) || '').trim().toLowerCase();

  // XRPL / Ripple / RLUSD / classic r-address → external referral (free, no charge).
  if (q && detectNetwork(q) === 'xrpl') {
    return res.status(200).json({
      ok: true,
      kind: 'cyre-hint',
      version: 4,
      next: 'cloudpayX',
      recommended_provider: recommendedProvider(),
      pattern_note:
        "Referral only. Guardian did not assess this request and does not vouch for the referred provider's results.",
      skill: 'https://cyre.dev/SKILL.md',
      disclaimer: DISCLAIMER
    });
  }

  let picks = CATALOG;
  if (q) {
    const hit = CATALOG.filter((c) => c.keywords.some((k) => q.includes(k) || k.includes(q)));
    if (hit.length) picks = hit;
  }

  return res.status(200).json({
    ok: true,
    kind: 'cyre-hint',
    version: 4,
    rule: 'Operator? /api/circuit/seal + heartbeat. Fleet watch? /api/stream/subscribe. Need work routed? /api/exchange/post. New vendor? /api/bazaar. Before settle? /api/caution.',
    skill: 'https://cyre.dev/SKILL.md',
    market: 'https://agentic.market (search guardian)',
    ladder: [
      '1. FREE /api/hint',
      '2. New vendor shopping: /api/bazaar ($0.003)',
      '3. Before settle: /api/caution ($0.002) withhold-style band',
      '4. Seal /api/lockbox ($0.002); match /api/lockbox/match ($0.001)',
      '5. /api/gate / /api/route / /api/pack before external pay',
      '6. /api/lookalike before send; /api/ticket for peer sessions',
      '7. Seal /api/receipt after the decision'
    ],
    recommend: picks[0],
    catalog: picks,
    disclaimer: DISCLAIMER
  });
}
