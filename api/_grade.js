// api/_grade.js — shared Solana address / mint / program pattern reads for agent skills.
// Zero-dep. Patterns, not verdicts. Used by handshake + preflight.

const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
export const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const DAY = 86400;
export const DISCLAIMER = 'Patterns, not verdicts.';
export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

// SPEC Watch seed mints — hold/touch affinity only (no weights/scores).
export const SEED_MINTS = [
  { symbol: 'USDY', mint: 'A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6' },
  { symbol: 'OUSG', mint: 'i7u4r16TcsJTgq1kAG8opmVZyVnAKBwLKu6ZPMwzxNc' },
  { symbol: 'syrupUSDC', mint: 'AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj' },
  { symbol: 'AAPLx', mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp' },
  { symbol: 'TSLAx', mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB' },
  { symbol: 'SPYx', mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W' }
];

/** Well-known Solana programs agents touch constantly — not "novel". */
export const KNOWN_PROGRAMS = new Set([
  '11111111111111111111111111111111',
  TOKEN_PROGRAM,
  TOKEN_2022_PROGRAM,
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  'ComputeBudget111111111111111111111111111111',
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
  'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDTwQqPWQM1',
  'SysvarRent111111111111111111111111111111111',
  'SysvarC1ock11111111111111111111111111111111',
  'SysvarRecentB1ockHashes11111111111111111111',
  'SysvarS1otHashes111111111111111111111111111',
  'Vote111111111111111111111111111111111111111',
  'Stake11111111111111111111111111111111111111',
  'Config1111111111111111111111111111111111111',
  'AddressLookupTab1e1111111111111111111111111',
  'BPFLoaderUpgradeab1e11111111111111111111111',
  'BPFLoader2111111111111111111111111111111111',
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
  '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'
]);

export async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'RPC error');
  return d.result;
}

export function signal(id, name, points, triggered, detail) {
  return { id, name, points, triggered, detail };
}

export function riskLevelFromScore(score) {
  if (score == null) return null;
  return score < 30 ? 'LOW' : score < 70 ? 'MEDIUM' : 'HIGH';
}

function buildSignalsFromList(list, sol) {
  const now = Math.floor(Date.now() / 1000);
  const times = list.map((s) => s.blockTime).filter(Boolean).sort((a, b) => a - b);
  const earliest = times[0] || now;
  const latest = times[times.length - 1] || now;
  const ageDays = Math.floor((now - earliest) / DAY);
  const idleDays = Math.floor((now - latest) / DAY);
  const capped = list.length >= 1000;
  const last24 = times.filter((t) => now - t < DAY).length;
  const failed = list.filter((s) => s.err).length;
  const failRate = list.length ? failed / list.length : 0;

  let biggestGap = 0;
  for (let i = 1; i < times.length; i++) {
    const g = times[i] - times[i - 1];
    if (g > biggestGap) biggestGap = g;
  }
  const gapDays = Math.floor(biggestGap / DAY);

  const signals = [];

  signals.push(
    capped
      ? signal(
          'age',
          'Wallet age',
          0,
          false,
          ageDays < 1
            ? 'Too active to date — the 1,000 most recent transactions all landed within a day; first activity is older than this window reaches'
            : `Active for at least ${ageDays} days — history runs deeper than the 1,000-transaction window`
        )
      : ageDays < 7
        ? signal('age', 'Wallet age', 26, true, `First activity ${ageDays} day${ageDays === 1 ? '' : 's'} ago — a very new wallet`)
        : ageDays < 30
          ? signal('age', 'Wallet age', 12, true, `First activity ${ageDays} days ago`)
          : signal('age', 'Wallet age', 0, false, `First activity ${ageDays} days ago`)
  );

  signals.push(
    last24 >= 40
      ? signal('burst', 'Activity burst', 24, true, `${last24} transactions in the last 24 hours`)
      : last24 >= 15
        ? signal('burst', 'Activity burst', 12, true, `${last24} transactions in the last 24 hours`)
        : signal('burst', 'Activity burst', 0, false, `${last24} transactions in the last 24 hours`)
  );

  signals.push(
    failRate > 0.3
      ? signal(
          'failures',
          'Failed transactions',
          18,
          true,
          `${Math.round(failRate * 100)}% of recent transactions failed — often automated behaviour`
        )
      : signal(
          'failures',
          'Failed transactions',
          0,
          false,
          `${Math.round(failRate * 100)}% of recent transactions failed`
        )
  );

  signals.push(
    gapDays >= 90 && idleDays < 7
      ? signal('dormant', 'Dormant then active', 20, true, `Was inactive for ${gapDays} days, then moved again recently`)
      : signal(
          'dormant',
          'Dormant then active',
          0,
          false,
          gapDays ? `Longest quiet stretch was ${gapDays} days` : 'Activity is continuous'
        )
  );

  signals.push(
    sol < 0.01 && list.length > 20
      ? signal(
          'balance',
          'Balance vs activity',
          14,
          true,
          `Holds ${sol.toFixed(4)} SOL despite ${list.length}+ recent transactions — pass-through pattern`
        )
      : signal('balance', 'Balance vs activity', 0, false, `Holds ${sol.toFixed(4)} SOL`)
  );

  signals.push(
    list.length < 5
      ? signal(
          'history',
          'Transaction history',
          10,
          true,
          `Only ${list.length} transaction${list.length === 1 ? '' : 's'} on record`
        )
      : signal(
          'history',
          'Transaction history',
          0,
          false,
          capped ? '1,000+ recent transactions' : `${list.length} transactions on record`
        )
  );

  const score = Math.min(signals.reduce((s, x) => s + x.points, 0), 100);
  return {
    score,
    riskLevel: riskLevelFromScore(score),
    signals,
    signalsTriggered: signals.filter((s) => s.triggered).length,
    signalsEvaluated: signals.length,
    profile: {
      ageDays,
      ageIsMinimum: capped,
      idleDays,
      transactionsSeen: list.length,
      last24h: last24,
      failedPercent: Math.round(failRate * 100),
      longestGapDays: gapDays,
      balanceSol: Number(sol.toFixed(4))
    },
    empty: false
  };
}

export function buildMintAffinity(tokenAccounts) {
  const byMint = new Map();
  const list = Array.isArray(tokenAccounts) ? tokenAccounts : [];
  for (const acc of list) {
    const info = acc && acc.account && acc.account.data && acc.account.data.parsed && acc.account.data.parsed.info;
    if (!info || !info.mint) continue;
    const amountRaw = info.tokenAmount && info.tokenAmount.amount;
    let amount = 0;
    if (typeof amountRaw === 'string') amount = Number(amountRaw);
    else if (typeof amountRaw === 'number') amount = amountRaw;
    const prev = byMint.get(info.mint) || { touch: false, hold: false };
    prev.touch = true;
    if (amount > 0) prev.hold = true;
    byMint.set(info.mint, prev);
  }
  return SEED_MINTS.map(({ symbol, mint }) => {
    const hit = byMint.get(mint);
    return {
      symbol,
      mint,
      hold: !!(hit && hit.hold),
      touch: !!(hit && hit.touch)
    };
  });
}

/**
 * Grade a Solana address (same 1k-sig window + 6 signals as /api/address).
 * Optional mintAffinity when withAffinity=true.
 */
export async function gradeAddress(address, opts = {}) {
  const withAffinity = !!opts.withAffinity;
  const fetchedAt = new Date().toISOString();
  const jobs = [
    rpc('getSignaturesForAddress', [address, { limit: 1000 }]),
    rpc('getBalance', [address])
  ];
  if (withAffinity) {
    jobs.push(
      rpc('getTokenAccountsByOwner', [
        address,
        { programId: TOKEN_PROGRAM },
        { encoding: 'jsonParsed' }
      ]).catch(() => null)
    );
  }
  const [sigs, bal, tokenAccounts] = await Promise.all(jobs);
  const list = Array.isArray(sigs) ? sigs : [];
  const sol = (bal && typeof bal.value === 'number' ? bal.value : 0) / 1e9;

  let mintAffinity = null;
  if (withAffinity) {
    const accounts =
      tokenAccounts && Array.isArray(tokenAccounts.value)
        ? tokenAccounts.value
        : Array.isArray(tokenAccounts)
          ? tokenAccounts
          : [];
    mintAffinity = buildMintAffinity(accounts);
  }

  if (!list.length) {
    return {
      address,
      fetchedAt,
      empty: true,
      score: null,
      riskLevel: null,
      signals: [],
      signalsTriggered: 0,
      signalsEvaluated: 0,
      profile: {
        ageDays: 0,
        ageIsMinimum: false,
        idleDays: 0,
        transactionsSeen: 0,
        last24h: 0,
        failedPercent: 0,
        longestGapDays: 0,
        balanceSol: Number(sol.toFixed(4))
      },
      ...(mintAffinity ? { mintAffinity } : {}),
      message: 'No transaction history found for this address.'
    };
  }

  const graded = buildSignalsFromList(list, sol);
  return {
    address,
    fetchedAt,
    ...graded,
    ...(mintAffinity ? { mintAffinity } : {})
  };
}

/** Light mint authority / program facts (no holder scan). */
export async function mintAuthorityFacts(mint) {
  const info = await rpc('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
  const value = info && info.value;
  if (!value) {
    return { mint, exists: false, signals: [signal('mint_missing', 'Mint account', 25, true, 'No account found at this mint address')] };
  }
  const owner = value.owner || null;
  const parsed = value.data && value.data.parsed;
  const type = parsed && parsed.type;
  const pinfo = parsed && parsed.info;
  if (type !== 'mint' || !pinfo) {
    return {
      mint,
      exists: true,
      owner,
      isMint: false,
      signals: [signal('not_mint', 'Mint shape', 20, true, 'Account exists but is not a token mint')]
    };
  }
  const mintAuthority = pinfo.mintAuthority || null;
  const freezeAuthority = pinfo.freezeAuthority || null;
  const supply = pinfo.supply != null ? String(pinfo.supply) : null;
  const decimals = typeof pinfo.decimals === 'number' ? pinfo.decimals : null;
  const isToken2022 = owner === TOKEN_2022_PROGRAM;
  const signals = [];
  let points = 0;
  if (mintAuthority) {
    points += 30;
    signals.push(signal('mint_auth', 'Mint authority', 30, true, 'Mint authority is ACTIVE — supply can still increase'));
  } else {
    signals.push(signal('mint_auth', 'Mint authority', 0, false, 'Mint authority revoked — supply is fixed'));
  }
  if (freezeAuthority) {
    points += 25;
    signals.push(signal('freeze_auth', 'Freeze authority', 25, true, 'Freeze authority is ACTIVE — accounts can be frozen'));
  } else {
    signals.push(signal('freeze_auth', 'Freeze authority', 0, false, 'Freeze authority revoked'));
  }
  if (isToken2022) {
    points += 8;
    signals.push(signal('token2022', 'Token program', 8, true, 'Token-2022 mint — transfer hooks / extensions may apply (not fully enumerated here)'));
  } else {
    signals.push(signal('token2022', 'Token program', 0, false, 'Classic SPL Token program'));
  }
  return {
    mint,
    exists: true,
    isMint: true,
    owner,
    mintAuthority,
    freezeAuthority,
    mintAuthorityRevoked: !mintAuthority,
    freezeAuthorityRevoked: !freezeAuthority,
    isToken2022,
    supply,
    decimals,
    score: Math.min(points, 100),
    riskLevel: riskLevelFromScore(Math.min(points, 100)),
    signals
  };
}

/** Program novelty: age from signature window + upgradeable loader hint. */
export async function programNovelty(programId) {
  if (KNOWN_PROGRAMS.has(programId)) {
    return {
      programId,
      known: true,
      signals: [signal('program_known', 'Program novelty', 0, false, 'Well-known Solana program')]
    };
  }
  const [sigs, info] = await Promise.all([
    rpc('getSignaturesForAddress', [programId, { limit: 20 }]).catch(() => []),
    rpc('getAccountInfo', [programId, { encoding: 'base64' }]).catch(() => null)
  ]);
  const list = Array.isArray(sigs) ? sigs : [];
  const value = info && info.value;
  const owner = value && value.owner;
  const executable = !!(value && value.executable);
  const now = Math.floor(Date.now() / 1000);
  const times = list.map((s) => s.blockTime).filter(Boolean).sort((a, b) => a - b);
  const earliest = times[0] || null;
  const ageDays = earliest ? Math.floor((now - earliest) / DAY) : null;
  const signals = [];
  let points = 0;
  if (!value) {
    points += 22;
    signals.push(signal('program_missing', 'Program account', 22, true, 'No account at this program id'));
  } else if (!executable) {
    points += 10;
    signals.push(signal('program_exec', 'Executable', 10, true, 'Account is not marked executable — unusual for a program id'));
  } else {
    signals.push(signal('program_exec', 'Executable', 0, false, 'Account is executable'));
  }
  if (ageDays != null && ageDays < 7) {
    points += 18;
    signals.push(signal('program_age', 'Program age', 18, true, `First seen activity in this window ~${ageDays} day${ageDays === 1 ? '' : 's'} ago — young program`));
  } else if (ageDays != null && ageDays < 30) {
    points += 8;
    signals.push(signal('program_age', 'Program age', 8, true, `First seen activity in this window ~${ageDays} days ago`));
  } else if (ageDays != null) {
    signals.push(signal('program_age', 'Program age', 0, false, `Active for at least ${ageDays} days in the measured window`));
  } else {
    points += 12;
    signals.push(signal('program_age', 'Program age', 12, true, 'No recent signatures found for this program id'));
  }
  if (owner === 'BPFLoaderUpgradeab1e11111111111111111111111') {
    signals.push(signal('upgradeable', 'Upgradeable loader', 0, false, 'Upgradeable BPF loader — upgrade authority not decoded in v1'));
  }
  return {
    programId,
    known: false,
    exists: !!value,
    executable,
    owner: owner || null,
    ageDays,
    ageIsMinimum: list.length >= 20,
    score: Math.min(points, 100),
    riskLevel: riskLevelFromScore(Math.min(points, 100)),
    signals
  };
}
