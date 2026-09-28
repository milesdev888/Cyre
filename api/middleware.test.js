// api/middleware.test.js — pure unit tests for lookalike + policy + offer helpers
// Run: node --input-type=module -e "import('./api/middleware.test.js')"

import { comparePair, scanLookalikes, levenshtein, detectFamily } from './_lookalike.js';
import { evaluatePolicy } from './_policycheck.js';
import { decodePaymentRequired, analyzeOffer } from './_offerparse.js';
import { cautionBandFromScore } from './_paybrief.js';
import { matchIntentToVendor, summarizeIntent } from './_exchange.js';
import { heartbeatStale, evaluateCircuit } from './_circuit.js';
import { reasonsForGrade } from './_streamlib.js';
import { matchLockbox } from './lockbox-match.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assert failed');
}

function runLookalike() {
  assert(detectFamily('0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712') === 'evm', 'evm');
  assert(detectFamily('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM') === 'solana', 'sol');

  assert(levenshtein('abc', 'abc') === 0, 'lev 0');
  assert(levenshtein('abc', 'abd') === 1, 'lev 1');

  const base = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
  const mid = base.slice(0, 8) + 'zzzzzz' + base.slice(14);
  assert(mid.length === base.length, 'same length');
  const pair = comparePair(mid, base);
  assert(pair.triggered, 'near edit should trigger: ' + JSON.stringify(pair.flags));
  assert(pair.points >= 12, 'points');

  const exact = comparePair(base, base);
  assert(exact.exact && !exact.triggered, 'exact');

  const scan = scanLookalikes(mid, [base, '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9']);
  assert(scan.hits.some((h) => h.triggered), 'scan hits');
  assert(scan.score >= 12, 'scan score');

  const evmA = '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712';
  const evmB = '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa713';
  const flip = comparePair(evmB, evmA);
  assert(flip.triggered, 'single nibble flip');
}

function runPolicy() {
  const claims = {
    kind: 'cyre-spend-policy',
    maxSpendAtomic: '10000',
    allowHosts: ['example.com'],
    denyHosts: ['evil.xyz'],
    networks: ['eip155:8453'],
    maxRisk: 'MEDIUM',
    requireTicket: true,
    denyFreshEoa: true
  };

  const ok = evaluatePolicy(claims, {
    amountAtomic: '5000',
    resourceUrl: 'https://api.example.com/pay',
    network: 'eip155:8453',
    riskLevel: 'LOW',
    hasTicket: true,
    freshEoa: false
  });
  assert(ok.ok, 'policy should pass: ' + ok.reasons.join(','));

  const over = evaluatePolicy(claims, {
    amountAtomic: '20000',
    resourceUrl: 'https://example.com/x',
    hasTicket: true
  });
  assert(!over.ok && over.reasons.includes('over_max_spend'), 'over spend');

  const deny = evaluatePolicy(claims, {
    amountAtomic: '100',
    resourceUrl: 'https://evil.xyz/x',
    hasTicket: true
  });
  assert(!deny.ok && deny.reasons.includes('deny_host'), 'deny host');

  const noTicket = evaluatePolicy(claims, {
    amountAtomic: '100',
    resourceUrl: 'https://example.com/x',
    hasTicket: false
  });
  assert(!noTicket.ok && noTicket.reasons.includes('ticket_required'), 'ticket required');

  const bad = evaluatePolicy({ kind: 'other' }, {});
  assert(!bad.ok && bad.reasons.includes('not_a_policy'), 'not a policy');
}

function runOffer() {
  const body = {
    x402Version: 2,
    accepts: [
      { network: 'eip155:8453', amount: '1000', payTo: '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712' },
      { network: 'eip155:8453', amount: '2000', payTo: '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712' }
    ],
    resource: { url: 'https://evil.xyz/api/paid' }
  };
  const analysis = analyzeOffer(body, {
    amount: '1000',
    payTo: '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712',
    resourceUrl: 'https://evil.xyz/api/paid',
    facilitator: 'https://unknown-facilitator.example/x402'
  });
  assert(analysis.acceptsCount === 2, 'accepts count');
  assert(analysis.signals.some((s) => s.id === 'amount_spread' && s.triggered), 'amount spread');
  assert(analysis.signals.some((s) => s.id === 'payto_recycle' && s.triggered), 'payto recycle');
  assert(analysis.signals.some((s) => s.id === 'facilitator_unknown' && s.triggered), 'unknown facilitator');
  assert(analysis.score >= 20, 'offer score');

  const b64 = Buffer.from(JSON.stringify(body)).toString('base64');
  const decoded = decodePaymentRequired(b64);
  assert(!decoded.error && decoded.body.accepts.length === 2, 'decode b64');

  const bad = decodePaymentRequired('%%%');
  assert(bad.error, 'bad decode');
}

function runCaution() {
  assert(cautionBandFromScore(0).band === 'proceed_with_pins', 'low band');
  assert(cautionBandFromScore(19).band === 'proceed_with_pins', 'low edge');
  assert(cautionBandFromScore(20).band === 'review', 'review');
  assert(cautionBandFromScore(49).band === 'review', 'review edge');
  assert(cautionBandFromScore(50).band === 'high_caution', 'high');
  assert(typeof cautionBandFromScore(10).hint === 'string' && cautionBandFromScore(10).hint.length > 10, 'hint');
}

function runLockboxMatch() {
  const claims = {
    kind: 'cyre-intent-lockbox',
    intentHash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    payTo: '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712',
    amountAtomic: '10000',
    resourceUrl: 'https://example.com/api/paid',
    network: 'eip155:8453'
  };
  const ok = matchLockbox(claims, {
    intentHash: claims.intentHash,
    payTo: claims.payTo,
    amountAtomic: '10000',
    resourceUrl: claims.resourceUrl,
    network: 'eip155:8453'
  });
  assert(ok.matched && ok.mismatches.length === 0, 'lockbox match');

  const bad = matchLockbox(claims, {
    intentHash: claims.intentHash,
    payTo: '0x0000000000000000000000000000000000000001',
    amountAtomic: '999'
  });
  assert(!bad.matched && bad.mismatches.includes('payTo') && bad.mismatches.includes('amountAtomic'), 'mismatches');

  const intentKind = matchLockbox({ ...claims, kind: 'cyre-intent-seal' }, { intentHash: claims.intentHash });
  assert(intentKind.matched, 'intent kind accepted');
}

function runExchange() {
  const intent = {
    kind: 'cyre-exchange-intent',
    id: 'x',
    actor: 'agent-1',
    need: 'token scan',
    budgetAtomic: '20000',
    network: 'eip155:8453',
    deadlineAt: new Date(Date.now() + 3600_000).toISOString(),
    status: 'open',
    tags: ['scan']
  };
  const summary = summarizeIntent(intent);
  assert(summary && !summary.expired, 'intent summary');

  const fit = matchIntentToVendor(intent, {
    resourceUrl: 'https://cyre.dev/api/token',
    payTo: '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712',
    amountAtomic: '10000',
    network: 'eip155:8453'
  });
  assert(fit.ok, 'exchange match');

  const over = matchIntentToVendor(intent, { amountAtomic: '50000', network: 'eip155:8453', payTo: '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712' });
  assert(!over.ok && over.reasons.includes('over_budget'), 'over budget');
}

function runCircuit() {
  const now = Date.now();
  const claims = {
    kind: 'cyre-circuit-breaker',
    heartbeatIntervalSeconds: 300,
    maxMissedBeats: 2,
    lastBeatAt: new Date(now - 1000).toISOString(),
    frozen: false,
    maxSpendAtomic: '10000',
    allowHosts: ['example.com']
  };
  const hb = heartbeatStale(claims, now);
  assert(!hb.stale, 'fresh heartbeat');

  const admit = evaluateCircuit(claims, {
    amountAtomic: '5000',
    resourceUrl: 'https://api.example.com/x',
    network: 'eip155:8453'
  });
  assert(admit.ok, 'circuit admits');

  const staleClaims = { ...claims, lastBeatAt: new Date(now - 900_000).toISOString() };
  const frozen = evaluateCircuit(staleClaims, { amountAtomic: '1' });
  assert(!frozen.ok && frozen.frozen, 'stale freezes');
}

function runStreamLib() {
  const g = { score: 40, riskLevel: 'HIGH', signals: [{ id: 'burst', triggered: true }], signalsTriggered: 1 };
  const reasons = reasonsForGrade(g, 'HIGH', null);
  assert(reasons.includes('first_seen'), 'first seen');
  assert(reasons.includes('risk_high'), 'risk high');
}

function run() {
  runLookalike();
  runPolicy();
  runOffer();
  runCaution();
  runLockboxMatch();
  runExchange();
  runCircuit();
  runStreamLib();
  console.log('All middleware (lookalike + policy + offer + caution + lockbox + trinity) tests passed.');
}

run();
