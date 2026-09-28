// api/_policycheck.js — evaluate a spend-policy claims object against a proposed pay (pure).

import { signal } from './_grade.js';

const RISK_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3 };

export function evaluatePolicy(claims, proposal = {}) {
  const signals = [];
  const reasons = [];
  let ok = true;

  if (!claims || claims.kind !== 'cyre-spend-policy') {
    return {
      ok: false,
      reasons: ['not_a_policy'],
      signals: [signal('not_policy', 'Policy', 40, true, 'Token is not a cyre-spend-policy')]
    };
  }

  const host = (() => {
    if (!proposal.resourceUrl) return null;
    try {
      return new URL(proposal.resourceUrl).hostname.toLowerCase();
    } catch (e) {
      return null;
    }
  })();

  if (claims.maxSpendAtomic != null && proposal.amountAtomic != null) {
    try {
      if (BigInt(String(proposal.amountAtomic)) > BigInt(String(claims.maxSpendAtomic))) {
        ok = false;
        reasons.push('over_max_spend');
        signals.push(
          signal(
            'over_max_spend',
            'Max spend',
            30,
            true,
            `amount ${proposal.amountAtomic} > policy maxSpendAtomic ${claims.maxSpendAtomic}`
          )
        );
      } else {
        signals.push(signal('spend_ok', 'Max spend', 0, false, 'amount within maxSpendAtomic'));
      }
    } catch (e) {
      ok = false;
      reasons.push('bad_amount');
      signals.push(signal('bad_amount', 'Max spend', 16, true, 'Could not compare amountAtomic to policy'));
    }
  }

  if (host && Array.isArray(claims.denyHosts) && claims.denyHosts.includes(host)) {
    ok = false;
    reasons.push('deny_host');
    signals.push(signal('deny_host', 'Host deny', 28, true, `Host ${host} is on denyHosts`));
  }
  if (host && Array.isArray(claims.allowHosts) && claims.allowHosts.length) {
    const allowed = claims.allowHosts.some((h) => host === h || host.endsWith('.' + h));
    if (!allowed) {
      ok = false;
      reasons.push('host_not_allowed');
      signals.push(signal('host_not_allowed', 'Host allow', 26, true, `Host ${host} not in allowHosts`));
    } else {
      signals.push(signal('host_allowed', 'Host allow', 0, false, `Host ${host} allowed`));
    }
  }

  if (proposal.network && Array.isArray(claims.networks) && claims.networks.length) {
    if (!claims.networks.includes(proposal.network)) {
      ok = false;
      reasons.push('network_not_allowed');
      signals.push(
        signal('network_not_allowed', 'Network', 20, true, `network ${proposal.network} not in policy networks`)
      );
    }
  }

  if (claims.maxRisk && proposal.riskLevel) {
    const have = RISK_RANK[String(proposal.riskLevel).toUpperCase()] || 99;
    const ceil = RISK_RANK[String(claims.maxRisk).toUpperCase()] || 0;
    if (have > ceil) {
      ok = false;
      reasons.push('risk_ceiling');
      signals.push(
        signal('risk_ceiling', 'Risk', 22, true, `riskLevel ${proposal.riskLevel} above policy maxRisk ${claims.maxRisk}`)
      );
    }
  }

  if (claims.denyFreshEoa && proposal.freshEoa) {
    ok = false;
    reasons.push('fresh_eoa');
    signals.push(signal('fresh_eoa', 'Fresh EOA', 24, true, 'Policy denies fresh EOAs; counterparty flagged fresh'));
  }

  if (claims.requireTicket && !proposal.hasTicket) {
    ok = false;
    reasons.push('ticket_required');
    signals.push(signal('ticket_required', 'Ticket', 18, true, 'Policy requires a session ticket'));
  }

  if (!signals.length) {
    signals.push(signal('policy_vacuous', 'Policy', 0, false, 'No applicable policy pins for this proposal'));
  }

  return { ok, reasons: ok ? [] : reasons, signals };
}
