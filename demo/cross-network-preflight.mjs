#!/usr/bin/env node
/**
 * demo/cross-network-preflight.mjs — hackathon demo (Node 20+, zero deps)
 *
 * Story: agent must pay Base USDC *or* XRPL RLUSD. Ask Guardian (Base) +
 * cloudpayX (XRPL), then seal one Decision Receipt covering both.
 *
 * Default = unpaid-demo (exit 0, stub artifacts). Never embed secrets.
 *
 * Usage: node demo/cross-network-preflight.mjs --config demo/config.example.json
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, 'out');

const GUARDIAN = 'https://cyre.dev';
const CLOUDPAYX_CARD = 'https://api.cloudpayxagent.xyz/.well-known/agent-card.json';
// Paid skill HTTP surface (A2A message/send is unpaid discovery — see README).
const CLOUDPAYX_ROUTE = 'https://api.cloudpayxagent.xyz/agent/v3/stablecoin-route';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

function loadConfig() {
  const path = resolve(process.cwd(), argValue('--config') || 'demo/config.example.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function fetchJson(url, init = {}) {
  const r = await fetch(url, init);
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 2000) };
  }
  return { status: r.status, headers: r.headers, json, text };
}

function paymentRequiredFrom(res) {
  const h = res.headers.get('payment-required') || res.headers.get('PAYMENT-REQUIRED');
  if (h) {
    try {
      return JSON.parse(Buffer.from(h, 'base64').toString('utf8'));
    } catch {
      return { decodeError: true, headerPreview: String(h).slice(0, 80) };
    }
  }
  if (res.status === 402 && res.json) return res.json;
  return null;
}

/**
 * XRPL x402 payment adapter — Yvon / cloudpayX fills this in.
 * @param {object} _offer
 */
export async function payXrpl402(_offer) {
  // cloudpayX: implement XRPL XRP/RLUSD x402 settle here, then retry the paid resource.
  throw new Error('NotImplemented: payXrpl402 — cloudpayX side fills XRPL payment');
}

async function guardianGet(path, query, { allowPay } = {}) {
  const qs = new URLSearchParams(query).toString();
  const url = GUARDIAN + path + (qs ? '?' + qs : '');

  if (process.env.AWAL === '1' && allowPay) {
    const q = JSON.stringify(query);
    console.log('   (AWAL=1) npx awal x402 pay', url);
    const r = spawnSync('npx', ['awal', 'x402', 'pay', url, '--query', q], {
      encoding: 'utf8',
      shell: false,
      timeout: 120000
    });
    const out = (r.stdout || '') + (r.stderr || '');
    return {
      status: r.status === 0 ? 200 : 500,
      json: { mode: 'awal', ok: r.status === 0, output: out.slice(0, 4000) },
      offer: null
    };
  }

  const headers = { accept: 'application/json' };
  const key = (process.env.GUARDIAN_DEMO_KEY || '').trim();
  if (key) headers['x-guardian-key'] = key;

  const res = await fetchJson(url, { method: 'GET', headers });
  const offer = paymentRequiredFrom(res);
  if (res.status === 402 || offer) {
    console.log('   Guardian 402 offer:', JSON.stringify(offer || res.json).slice(0, 500));
    return {
      status: 402,
      json: { mode: 'unpaid-demo', offer: offer || res.json, path },
      offer: offer || res.json
    };
  }
  return { status: res.status, json: res.json, offer: null };
}

async function cloudpayXStablecoinRoute(xrpl) {
  // Single cloudpayX call per run (paid REST — returns 402 without payment).
  const body = {
    from: { asset: xrpl.currency || 'RLUSD' },
    to: { asset: 'USDC' },
    amount: Number(xrpl.amount) || 10,
    objective: 'BEST_EXECUTION',
    destination: xrpl.destination
  };
  const res = await fetchJson(CLOUDPAYX_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body)
  });
  const offer = paymentRequiredFrom(res);
  if (offer || res.status === 402) {
    console.log('   cloudpayX 402 offer:', JSON.stringify(offer || res.json).slice(0, 500));
    try {
      await payXrpl402(offer || res.json);
    } catch (e) {
      console.log('   payXrpl402:', e.message);
    }
    return { mode: 'unpaid-demo', offer: offer || res.json, destination: xrpl.destination };
  }
  return { mode: 'live', data: res.json, status: res.status };
}

function riskRank(level) {
  const m = { LOW: 1, MEDIUM: 2, HIGH: 3 };
  return m[String(level || '').toUpperCase()] || 0;
}

function highestRisk(...levels) {
  let best = 'LOW';
  for (const l of levels) {
    if (riskRank(l) > riskRank(best)) best = String(l || 'LOW').toUpperCase();
  }
  return best;
}

function topSignals(grade) {
  const sigs = (grade && grade.signals) || [];
  return sigs
    .filter((s) => s && s.triggered)
    .sort((a, b) => (b.points || 0) - (a.points || 0))
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      name: s.name,
      points: s.points,
      reason: s.detail || s.reason || ''
    }));
}

function writeMarkdown({ artifact, intentHash, receipt, config }) {
  const base = artifact.base || {};
  const xrpl = artifact.xrpl || {};
  const token =
    (receipt && (receipt.token || receipt.receipt || (receipt.data && receipt.data.token))) ||
    (receipt && receipt.mode === 'unpaid-demo' ? '(unpaid-demo — no token)' : '(none)');

  const lines = [];
  lines.push('# Cross-network Decision Receipt');
  lines.push('');
  lines.push('_Patterns, not verdicts. Each specialist assessed only its own network; neither validated the other._');
  lines.push('');
  lines.push('## Base leg — assessed by CYRE Guardian');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|---|---|');
  lines.push(`| Network | Base (eip155:8453) / USDC |`);
  lines.push(`| Assessed by | CYRE Guardian |`);
  lines.push(`| Mode | ${base.mode || '—'} |`);
  lines.push(`| payTo | \`${config.base.payTo}\` |`);
  lines.push(`| amountAtomic | ${config.base.amountAtomic} |`);
  lines.push(`| Risk band | ${base.riskLevel || '—'} |`);
  lines.push('');
  lines.push('Top signals:');
  lines.push('');
  const bs = base.signals || [];
  if (!bs.length) lines.push('- (none triggered / unpaid stub)');
  for (const s of bs) {
    lines.push(`- **${s.name || s.id}** (${s.points ?? '?'} pts) — ${s.reason || '—'}`);
  }
  lines.push('');
  lines.push('## XRPL leg — assessed by cloudpayX (external specialist)');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|---|---|');
  lines.push(`| Network | XRPL |`);
  lines.push(`| Assessed by | cloudpayX (external specialist) |`);
  lines.push(`| Mode | ${xrpl.mode || '—'} |`);
  lines.push(`| Destination | \`${config.xrpl.destination}\` |`);
  lines.push(`| Amount / currency | ${config.xrpl.amount} ${config.xrpl.currency} |`);
  lines.push(`| Skill | xrpl-stablecoin-route (REST /agent/v3/stablecoin-route) |`);
  lines.push('');
  if (xrpl.offer) {
    lines.push('Payment offer (verbatim summary): see `receipt.json` → `xrpl.offer`.');
    lines.push('');
  }
  lines.push('## Coordinator receipt');
  lines.push('');
  lines.push('_Guardian sealed a Decision Receipt over the combined artifact hashes. This is not a cross-network verdict._');
  lines.push('');
  lines.push(`- **actor:** \`${config.actor}\``);
  lines.push(`- **action:** \`cross-network-pay\``);
  lines.push(`- **intentHash:** \`${intentHash}\``);
  lines.push(`- **token:** \`${typeof token === 'string' ? token.slice(0, 120) : token}\``);
  lines.push('');
  lines.push('### Verify');
  if (typeof token === 'string' && token.length > 20 && !token.startsWith('(')) {
    lines.push(`https://cyre.dev/api/receipt/verify?token=${encodeURIComponent(token)}`);
  } else {
    lines.push('_No sealed token in unpaid-demo mode — re-run with `GUARDIAN_DEMO_KEY` or `AWAL=1` to seal._');
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const config = loadConfig();
  mkdirSync(OUT_DIR, { recursive: true });

  // 1. Discover referrals
  console.log('1. Discover referrals.');
  const hint = await fetchJson(GUARDIAN + '/api/hint?q=xrpl');
  const card = await fetchJson(CLOUDPAYX_CARD);
  const hintName = (hint.json && hint.json.next) || 'Guardian hint';
  const provider =
    (hint.json && hint.json.recommended_provider && hint.json.recommended_provider.name) || null;
  const cpayxName = (card.json && card.json.name) || 'cloudpayX';
  const skill = 'xrpl-stablecoin-route';
  console.log(`   Guardian hint → next=${hintName}; recommended_provider=${provider || '(none yet)'}`);
  console.log(`   ${cpayxName} agent card OK; will call skill ${skill} via REST ${CLOUDPAYX_ROUTE}`);

  // 2. Base leg → Guardian Gate (assessed by CYRE Guardian)
  console.log('2. Base leg → Guardian /api/gate (assessed by CYRE Guardian).');
  const gate = await guardianGet(
    '/api/gate',
    {
      payTo: config.base.payTo,
      amount: config.base.amountAtomic,
      resourceUrl: config.base.resourceUrl,
      chain: 'base'
    },
    { allowPay: true }
  );
  const baseArtifact = {
    network: 'eip155:8453',
    specialist: 'CYRE Guardian',
    mode: gate.json && gate.json.mode ? gate.json.mode : gate.status === 200 ? 'live' : 'unpaid-demo',
    riskLevel: (gate.json && (gate.json.riskLevel || (gate.json.data && gate.json.data.riskLevel))) || null,
    signals: topSignals(gate.json),
    rawStatus: gate.status,
    offer: gate.offer || null
  };
  if (gate.status === 200 && gate.json && !gate.json.mode) {
    baseArtifact.riskLevel = gate.json.riskLevel || baseArtifact.riskLevel;
    baseArtifact.signals = topSignals(gate.json);
  }

  // 3. XRPL leg → cloudpayX (one call; assessed by cloudpayX as external specialist)
  console.log('3. XRPL leg → cloudpayX stablecoin-route (assessed by cloudpayX, external specialist).');
  const xrplResult = await cloudpayXStablecoinRoute(config.xrpl);
  const xrplArtifact = {
    network: 'xrpl',
    specialist: 'cloudpayX',
    skill,
    mode: xrplResult.mode,
    destination: config.xrpl.destination,
    amount: config.xrpl.amount,
    currency: config.xrpl.currency,
    offer: xrplResult.offer || null,
    data: xrplResult.data || null
  };

  // 4. Combine
  console.log('4. Combine artifact + intentHash.');
  const artifact = {
    base: baseArtifact,
    xrpl: xrplArtifact,
    generatedAt: new Date().toISOString()
  };
  const intentHash = createHash('sha256').update(JSON.stringify(artifact)).digest('hex');
  console.log(`   intentHash=${intentHash}`);

  // 5. Seal → Guardian receipt
  console.log('5. Seal → Guardian /api/receipt.');
  const risk = highestRisk(baseArtifact.riskLevel);
  const receiptRes = await guardianGet(
    '/api/receipt',
    {
      actor: config.actor,
      intentHash,
      action: 'cross-network-pay',
      riskLevel: risk
    },
    { allowPay: true }
  );
  const receipt =
    receiptRes.status === 200 && !(receiptRes.json && receiptRes.json.mode === 'unpaid-demo')
      ? receiptRes.json
      : { mode: 'unpaid-demo', offer: receiptRes.offer, status: receiptRes.status };

  // 6. Write outputs
  console.log('6. Write demo/out/receipt.json + receipt.md.');
  const outJson = { artifact, intentHash, riskLevel: risk, receipt, config };
  writeFileSync(resolve(OUT_DIR, 'receipt.json'), JSON.stringify(outJson, null, 2));
  writeFileSync(resolve(OUT_DIR, 'receipt.md'), writeMarkdown({ artifact, intentHash, receipt, config }));
  console.log('Done. Patterns, not verdicts.');
  process.exit(0);
}

main().catch((e) => {
  console.error('demo failed:', e && e.message);
  process.exit(1);
});
