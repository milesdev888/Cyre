// api/_streamlib.js — shared watch evaluation for Pulse Stream (push-shaped pull).

export const RISK_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3 };

export function fingerprintFromGrade(g) {
  return {
    score: g.score,
    riskLevel: g.riskLevel,
    last24h: g.profile && g.profile.last24h != null ? g.profile.last24h : null,
    signalsTriggered: g.signalsTriggered,
    measuredAt: g.fetchedAt || null
  };
}

export function reasonsForGrade(g, minRisk, priorFp) {
  const reasons = [];
  const need = RISK_RANK[minRisk] || 3;
  const have = RISK_RANK[g.riskLevel] || 0;
  if (have >= need) reasons.push('risk_' + String(g.riskLevel).toLowerCase());
  const sigs = g.signals || [];
  if (sigs.some((s) => s.id === 'dormant' && s.triggered)) reasons.push('dormant');
  if (sigs.some((s) => s.id === 'burst' && s.triggered)) reasons.push('burst');
  if (sigs.some((s) => s.id === 'failures' && s.triggered)) reasons.push('failures');
  if (priorFp) {
    if (priorFp.riskLevel !== g.riskLevel) reasons.push('risk_changed');
    if (priorFp.score != null && Math.abs(Number(priorFp.score) - Number(g.score)) >= 15) reasons.push('score_drift');
  } else {
    reasons.push('first_seen');
  }
  return reasons;
}

export function buildStreamEvent(watch, g, reasons) {
  return {
    type: 'grade.changed',
    watch: watch.type || 'address',
    target: watch.target,
    score: g.score,
    riskLevel: g.riskLevel,
    reasons,
    empty: !!g.empty,
    measuredAt: g.fetchedAt || null
  };
}

export function parseWatches(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((w) => {
        if (typeof w === 'string') return { type: 'address', target: w.trim() };
        return { type: String((w && w.type) || 'address'), target: String((w && w.target) || '').trim() };
      })
      .filter((w) => w.target)
      .slice(0, 10);
  }
  return String(raw)
    .split(/[,\s]+/)
    .map((t) => ({ type: 'address', target: t.trim() }))
    .filter((w) => w.target)
    .slice(0, 10);
}
