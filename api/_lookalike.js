// api/_lookalike.js — address lookalike / truncation / confusing-char helpers (pure).

const EVM = /^0x[a-fA-F0-9]{40}$/;
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Confusable pairs for base58 display attacks (subset). */
const CONFUSABLES = {
  O: '0',
  '0': 'O',
  I: 'l',
  l: 'I',
  '1': 'l'
};

export function detectFamily(addr) {
  const s = String(addr || '').trim();
  if (EVM.test(s)) return 'evm';
  if (B58.test(s)) return 'solana';
  return null;
}

export function normalizeForCompare(addr, family) {
  const s = String(addr || '').trim();
  if (family === 'evm') return s.toLowerCase();
  return s;
}

export function levenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  const n = s.length;
  const m = t.length;
  if (!n) return m;
  if (!m) return n;
  const row = new Array(m + 1);
  for (let j = 0; j <= m; j++) row[j] = j;
  for (let i = 1; i <= n; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= m; j++) {
      const tmp = row[j];
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[m];
}

function headTail(s, n = 4) {
  if (s.length <= n * 2) return { head: s, tail: s };
  return { head: s.slice(0, n), tail: s.slice(-n) };
}

function confusableDistance(a, b) {
  if (a.length !== b.length) return null;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const mapped = CONFUSABLES[a[i]];
    if (mapped && mapped === b[i]) d += 1;
    else return null; // not a pure confusable edit
  }
  return d;
}

/**
 * Score how much `candidate` looks like `contact`.
 * Higher points = more concerning lookalike.
 */
export function comparePair(candidate, contact) {
  const famC = detectFamily(candidate);
  const famT = detectFamily(contact);
  if (!famC || !famT || famC !== famT) {
    return {
      contact,
      family: famC || famT || null,
      comparable: false,
      points: 0,
      triggered: false,
      flags: ['family_mismatch_or_invalid'],
      detail: 'Addresses are not the same family (EVM vs Solana) or invalid.'
    };
  }
  const a = normalizeForCompare(candidate, famC);
  const b = normalizeForCompare(contact, famT);
  if (a === b) {
    return {
      contact,
      family: famC,
      comparable: true,
      exact: true,
      points: 0,
      triggered: false,
      flags: ['exact_match'],
      detail: 'Exact match to a listed contact.'
    };
  }

  const flags = [];
  let points = 0;
  const dist = levenshtein(a, b);
  const len = Math.max(a.length, b.length);
  const ratio = len ? dist / len : 1;

  const htA = headTail(a, 4);
  const htB = headTail(b, 4);
  if (htA.head === htB.head && htA.tail === htB.tail && a !== b) {
    flags.push('prefix_suffix_trap');
    points += 40;
  } else if (htA.head === htB.head && a.slice(0, 8) === b.slice(0, 8)) {
    flags.push('shared_prefix');
    points += 18;
  } else if (htA.tail === htB.tail && a.slice(-8) === b.slice(-8)) {
    flags.push('shared_suffix');
    points += 18;
  }

  if (dist > 0 && dist <= 2 && a.length === b.length) {
    flags.push('near_edit');
    points += dist === 1 ? 36 : 28;
  } else if (ratio <= 0.08 && dist <= 4) {
    flags.push('high_similarity');
    points += 22;
  } else if (ratio <= 0.15 && dist <= 6) {
    flags.push('moderate_similarity');
    points += 12;
  }

  const conf = confusableDistance(a, b);
  if (conf != null && conf > 0 && conf <= 3) {
    flags.push('confusable_chars');
    points += 10 + conf * 6;
  }

  if (a.length === b.length && famC === 'evm' && dist === 1) {
    flags.push('single_nibble_flip');
    points = Math.max(points, 34);
  }

  points = Math.min(100, points);
  const triggered = points >= 12;
  let detail;
  if (!flags.length) {
    detail = `Edit distance ${dist} — not a close lookalike of this contact.`;
  } else {
    detail = `Looks similar to contact (distance ${dist}; flags: ${flags.join(', ')}). Confirm the full address before sending.`;
  }

  return {
    contact,
    family: famC,
    comparable: true,
    exact: false,
    distance: dist,
    ratio: Number(ratio.toFixed(4)),
    points,
    triggered,
    flags,
    detail
  };
}

/**
 * Compare candidate against up to `limit` contacts; return best hits.
 */
export function scanLookalikes(candidate, contacts, limit = 20) {
  const list = [...new Set((contacts || []).map((c) => String(c || '').trim()).filter(Boolean))].slice(0, limit);
  const comparisons = list.map((c) => comparePair(candidate, c));
  const hits = comparisons
    .filter((c) => c.triggered || c.exact)
    .sort((a, b) => b.points - a.points);
  const score = Math.min(100, hits.reduce((s, h) => Math.max(s, h.points), 0));
  return { comparisons, hits, score, contactCount: list.length };
}
