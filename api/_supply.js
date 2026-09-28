// api/_supply.js — $C7 circulating supply from on-chain vesting locks.
// circulating = TOTAL (100M) − Σ remaining locked in Streamflow + team Jupiter Lock escrow.

export const C7_MINT = '979sitxCjWFPdAsrF2ybKNENwFcpiHDwaAasC5Xa5qww';
export const C7_DECIMALS = 6;
/** Fixed total per tokenomics (not live mint supply — mint is immutable at 100M). */
export const TOTAL_SUPPLY = 100_000_000;

export const STREAMFLOW_PROGRAM = 'strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m';
export const JUPITER_LOCK_PROGRAM = 'LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn';

/** Locks published on /tokenomics (GRADUATED table). */
export const SUPPLY_LOCKS = [
  {
    id: 'treasury',
    label: 'Treasury',
    kind: 'streamflow',
    address: 'FtJK58noHkxKGt8ZCWR9vdjfR8wVY3tpXQX9h9ELqWu6',
    allocation: 60_000_000,
  },
  {
    id: 'community',
    label: 'Community pool',
    kind: 'streamflow',
    address: 'H6Lz9G7j8bARJRJjj6dXgcaCLpoALqxDEupkidz4sPEX',
    allocation: 5_000_000,
  },
  {
    id: 'team',
    label: 'Team',
    kind: 'jupiter_lock',
    address: 'FD99oRwpKuJdspVzbsW8nKQs8QAjsGUtd1RNRYBvsdBi',
    allocation: 10_000_000,
  },
];

/** CoinGecko/Jupiter-facing community float at launch (tokenomics legend). */
export const TOKENOMICS_LAUNCH_FLOAT = 25_000_000;

const SCALE = 10 ** C7_DECIMALS;

// Streamflow Contract layout (@streamflow/stream streamLayout)
const SF_WITHDRAWN = 17;
const SF_NET_DEPOSITED = 417;

// Jupiter Lock VestingEscrow (jupiter-lock-sdk)
const JL_CLIFF_UNLOCK = 160;
const JL_AMOUNT_PER = 168;
const JL_NUM_PERIODS = 176;
const JL_TOTAL_CLAIMED = 184;

/**
 * @param {Buffer|Uint8Array} raw
 * @returns {{ deposited: number, withdrawn: number, locked: number }}
 */
export function parseStreamflowLocked(raw) {
  const buf = Buffer.from(raw);
  if (buf.length < SF_NET_DEPOSITED + 8) {
    throw new Error('streamflow account too short');
  }
  const deposited = Number(buf.readBigUInt64LE(SF_NET_DEPOSITED)) / SCALE;
  const withdrawn = Number(buf.readBigUInt64LE(SF_WITHDRAWN)) / SCALE;
  const locked = Math.max(0, deposited - withdrawn);
  return { deposited, withdrawn, locked };
}

/**
 * @param {Buffer|Uint8Array} raw
 * @returns {{ total: number, claimed: number, locked: number, cliffUnlock: number, amountPerPeriod: number, periods: number }}
 */
export function parseJupiterLockLocked(raw) {
  const buf = Buffer.from(raw);
  if (buf.length < JL_TOTAL_CLAIMED + 8) {
    throw new Error('jupiter lock account too short');
  }
  const cliffUnlock = Number(buf.readBigUInt64LE(JL_CLIFF_UNLOCK)) / SCALE;
  const amountPerPeriod = Number(buf.readBigUInt64LE(JL_AMOUNT_PER)) / SCALE;
  const periods = Number(buf.readBigUInt64LE(JL_NUM_PERIODS));
  const claimed = Number(buf.readBigUInt64LE(JL_TOTAL_CLAIMED)) / SCALE;
  const total = cliffUnlock + amountPerPeriod * periods;
  const locked = Math.max(0, total - claimed);
  return { total, claimed, locked, cliffUnlock, amountPerPeriod, periods };
}

/**
 * @param {{ locks: Array<{ locked: number }> }} breakdown
 * @param {number} [total=TOTAL_SUPPLY]
 */
export function circulatingFromLocks(breakdown, total = TOTAL_SUPPLY) {
  const locked = breakdown.locks.reduce((s, x) => s + Number(x.locked || 0), 0);
  const circulating = Math.max(0, total - locked);
  return { total, locked, circulating };
}

/**
 * Fetch account data bytes (base64) via JSON-RPC.
 * @param {string} rpcUrl
 * @param {string} address
 * @returns {Promise<{ owner: string, data: Buffer }>}
 */
export async function fetchAccountRaw(rpcUrl, address) {
  const r = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getAccountInfo',
      params: [address, { encoding: 'base64' }],
    }),
  });
  const j = await r.json();
  if (!r.ok || j.error) {
    throw new Error((j && j.error && j.error.message) || `rpc http ${r.status}`);
  }
  const value = j.result && j.result.value;
  if (!value || !value.data || !value.data[0]) {
    throw new Error(`account missing: ${address}`);
  }
  return {
    owner: value.owner,
    data: Buffer.from(value.data[0], 'base64'),
  };
}

/**
 * Live supply snapshot.
 * @param {{ rpcUrl?: string, fetchAccount?: typeof fetchAccountRaw }} [opts]
 */
export async function computeSupply(opts = {}) {
  const rpcUrl = opts.rpcUrl || process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
  const fetchAccount = opts.fetchAccount || fetchAccountRaw;

  const locks = [];
  for (const lock of SUPPLY_LOCKS) {
    const acct = await fetchAccount(rpcUrl, lock.address);
    if (lock.kind === 'streamflow') {
      if (acct.owner !== STREAMFLOW_PROGRAM) {
        throw new Error(`${lock.id}: unexpected owner ${acct.owner}`);
      }
      const parsed = parseStreamflowLocked(acct.data);
      locks.push({
        id: lock.id,
        label: lock.label,
        kind: lock.kind,
        address: lock.address,
        allocation: lock.allocation,
        locked: roundTokens(parsed.locked),
        deposited: roundTokens(parsed.deposited),
        withdrawn: roundTokens(parsed.withdrawn),
      });
    } else if (lock.kind === 'jupiter_lock') {
      if (acct.owner !== JUPITER_LOCK_PROGRAM) {
        throw new Error(`${lock.id}: unexpected owner ${acct.owner}`);
      }
      const parsed = parseJupiterLockLocked(acct.data);
      locks.push({
        id: lock.id,
        label: lock.label,
        kind: lock.kind,
        address: lock.address,
        allocation: lock.allocation,
        locked: roundTokens(parsed.locked),
        total: roundTokens(parsed.total),
        claimed: roundTokens(parsed.claimed),
      });
    }
  }

  const { total, locked, circulating } = circulatingFromLocks({ locks });
  return {
    mint: C7_MINT,
    symbol: 'C7',
    name: 'CYRE',
    decimals: C7_DECIMALS,
    total: roundTokens(total),
    circulating: roundTokens(circulating),
    locked: roundTokens(locked),
    locks,
    formula: 'circulating = total − Σ(remaining locked balances)',
    tokenomicsUrl: 'https://cyre.dev/tokenomics',
    updatedAt: new Date().toISOString(),
  };
}

function roundTokens(n) {
  // keep micro-token precision without float noise
  return Math.round(Number(n) * SCALE) / SCALE;
}
