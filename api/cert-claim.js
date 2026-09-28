// api/cert-claim.js — POST /api/cert/claim
// First proven claim binds token / platform ID to one owner wallet.
// Later claim for the same bind from another wallet → refused.
// Signed message only — never a transaction.

import { verifyCertSignedAction } from './_cert-auth.js';
import { issueCert, getBindSerial, getCertBySerial, publicCertView } from './_cert-registry.js';
import { detectTokenCreator, isLaunchpadWallet } from './_cert-proofs.js';

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method not allowed' });
  }

  try {
    const body = await readBody(req);
    const wallet = String(body.wallet || '').trim();
    const auth = await verifyCertSignedAction({
      wallet,
      action: 'claim',
      nonce: body.nonce,
      message: body.message,
      signature: body.signature
    });
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    const type = body.type === 'personal' ? 'personal' : 'project';
    const proofKind = String(body.proofKind || body.bindKind || '').trim().toLowerCase();
    const proofId = String(body.proofId || body.bindId || body.mint || '').trim();
    if (!['token', 'x', 'tg', 'web'].includes(proofKind) || !proofId) {
      return res.status(400).json({
        ok: false,
        error: 'proofKind (token|x|tg|web) and proofId required'
      });
    }

    // One certificate per token / platform account ID
    const taken = await getBindSerial(proofKind, proofId);
    if (taken) {
      const existing = await getCertBySerial(taken);
      if (existing && existing.status !== 'REVOKED') {
        if (existing.ownerWallet !== wallet) {
          return res.status(409).json({
            ok: false,
            error: 'already claimed by another wallet',
            code: 'BIND_TAKEN',
            serial: taken
          });
        }
        return res.status(200).json({ ok: true, already: true, cert: publicCertView(existing) });
      }
      if (existing && existing.status === 'REVOKED' && existing.ownerWallet !== wallet) {
        return res.status(409).json({
          ok: false,
          error: 'this slot belongs to a dissolved certificate; only its owner can reissue',
          code: 'BIND_TAKEN',
          serial: taken
        });
      }
    }

    // X, Telegram and website are never bound on claim: the certificate starts
    // PENDING_PROOF and binds only when /api/cert/proof verifies ownership.
    if (proofKind !== 'token') {
      if (type === 'personal' && (body.legalName || body.location || body.balances)) {
        return res.status(400).json({
          ok: false,
          error: 'personal certificates never store legal name, balances, or location'
        });
      }
      const pending = await issueCert({
        type,
        ownerWallet: wallet,
        status: 'PENDING_PROOF',
        displayName: type === 'project' ? body.displayName || body.name || null : null,
        symbol: body.symbol || null,
        photoUrl: type === 'personal' ? body.photoUrl || null : null,
        proofs: []
      });
      return res.status(202).json({
        ok: true,
        cert: publicCertView(pending),
        next: `Verify ${proofKind} via POST /api/cert/proof (action=code, then kind=${proofKind}).`,
        note: 'Cyre never asks you to approve a transaction.'
      });
    }

    let status = 'VALID';
    let reviewReason = null;
    let proofMeta = {};

    if (proofKind === 'token') {
      const creator = await detectTokenCreator(proofId);
      proofMeta = { creator: creator || null };
      if (creator && isLaunchpadWallet(creator)) {
        status = 'NEEDS_REVIEW';
        reviewReason = 'launchpad creator wallet — Miles reviews manually';
      } else if (creator && creator !== wallet) {
        return res.status(403).json({
          ok: false,
          error: 'wallet is not the token creator from the launch transaction',
          code: 'NOT_CREATOR',
          creator
        });
      } else if (!creator) {
        // Creator could not be resolved from the launch transaction: never issue silently.
        status = 'NEEDS_REVIEW';
        reviewReason = 'creator not resolved from launch transaction';
      }
    }

    if (type === 'personal' && (body.legalName || body.location || body.balances)) {
      return res.status(400).json({
        ok: false,
        error: 'personal certificates never store legal name, balances, or location'
      });
    }

    const cert = await issueCert({
      type,
      ownerWallet: wallet,
      status,
      reviewReason,
      displayName: type === 'project' ? body.displayName || body.name || null : null,
      symbol: body.symbol || null,
      photoUrl: type === 'personal' ? body.photoUrl || null : null,
      proofs: [
        {
          kind: proofKind,
          id: proofId,
          display: body.proofDisplay || body.symbol || proofId,
          status: status === 'NEEDS_REVIEW' ? 'pending' : 'ok',
          meta: proofMeta
        }
      ]
    });

    return res.status(status === 'NEEDS_REVIEW' ? 202 : 201).json({
      ok: true,
      cert: publicCertView(cert),
      needsReview: status === 'NEEDS_REVIEW',
      reviewReason,
      note: 'Cyre never asks you to approve a transaction.'
    });
  } catch (e) {
    if (e && e.code === 'BIND_TAKEN') {
      return res.status(409).json({
        ok: false,
        error: e.message,
        code: e.code,
        serial: e.serial
      });
    }
    console.error('cert claim failed', e && e.message);
    return res.status(500).json({ ok: false, error: (e && e.message) || 'claim failed' });
  }
}
