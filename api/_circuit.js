// api/_circuit.js — operator circuit breaker evaluation (heartbeat + spend freeze).

import { evaluatePolicy } from './_policycheck.js';
import { verifyToken, POLICY_KIND } from './_attest.js';

export function heartbeatStale(claims, now = Date.now()) {
  if (!claims || claims.frozen) return { stale: true, reason: claims && claims.frozen ? 'frozen' : 'invalid' };
  const last = Date.parse(claims.lastBeatAt);
  if (!Number.isFinite(last)) return { stale: true, reason: 'bad_last_beat' };
  const interval = Number(claims.heartbeatIntervalSeconds) || 300;
  const maxMiss = Number(claims.maxMissedBeats) || 2;
  const graceMs = interval * maxMiss * 1000;
  if (now - last > graceMs) return { stale: true, reason: 'heartbeat_missed', missedMs: now - last - graceMs };
  return { stale: false, expiresInMs: graceMs - (now - last) };
}

export function policyClaimsFromCircuit(claims) {
  if (!claims) return null;
  if (claims.policyToken) {
    const v = verifyToken(claims.policyToken, Date.now(), { kinds: [POLICY_KIND] });
    if (v.valid && v.claims) return v.claims;
  }
  if (claims.maxSpendAtomic != null || (claims.allowHosts && claims.allowHosts.length)) {
    return {
      kind: POLICY_KIND,
      maxSpendAtomic: claims.maxSpendAtomic,
      allowHosts: claims.allowHosts || [],
      denyHosts: claims.denyHosts || [],
      maxRisk: claims.maxRisk || null,
      networks: claims.networks || []
    };
  }
  return null;
}

export function evaluateCircuit(claims, proposal = {}, now = Date.now()) {
  const hb = heartbeatStale(claims, now);
  const signals = [];
  const reasons = [];

  if (!claims || claims.kind !== 'cyre-circuit-breaker') {
    return { ok: false, frozen: true, reasons: ['not_a_circuit'], signals };
  }
  if (claims.frozen) {
    return { ok: false, frozen: true, reasons: ['circuit_frozen'], frozenAt: claims.frozenAt || null, signals };
  }
  if (hb.stale) {
    return {
      ok: false,
      frozen: true,
      reasons: [hb.reason || 'heartbeat_stale'],
      heartbeat: hb,
      signals
    };
  }

  const policyClaims = policyClaimsFromCircuit(claims);
  if (policyClaims) {
    const pol = evaluatePolicy(policyClaims, proposal);
    if (!pol.ok) {
      return {
        ok: false,
        frozen: false,
        reasons: pol.reasons,
        signals: pol.signals,
        heartbeat: hb
      };
    }
    signals.push(...pol.signals);
  }

  return { ok: true, frozen: false, reasons: [], signals, heartbeat: hb };
}
