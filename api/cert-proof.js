// api/cert-proof.js — POST /api/cert/proof  (add / verify a Phase 1 proof on an existing cert)
// Also POST action=code to mint a one-time X/website code.

import { verifyCertSignedAction } from './_cert-auth.js';
import {
  getCertBySerial,
  saveCert,
  setBind,
  getBindSerial,
  appendCertEvent,
  publicCertView,
  normalizeCertSerial
} from './_cert-registry.js';
import {
  issueProofCode,
  loadProofCode,
  verifyXProof,
  verifyTelegramProof,
  verifyWebsiteProof
} from './_cert-proofs.js';

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
    const action = String(body.action || 'add').toLowerCase();
    const serial = normalizeCertSerial(body.serial);
    if (!serial || !String(serial).startsWith('CYR-')) {
      return res.status(400).json({ ok: false, error: 'CYR serial required' });
    }
    const cert = await getCertBySerial(serial);
    if (!cert || cert.legacyBadge) {
      return res.status(404).json({ ok: false, error: 'certificate not found' });
    }
    if (cert.status === 'REVOKED') {
      return res.status(410).json({ ok: false, error: 'certificate REVOKED' });
    }

    const wallet = String(body.wallet || '').trim();
    if (!wallet || wallet !== cert.ownerWallet) {
      return res.status(403).json({ ok: false, error: 'owner wallet required' });
    }

    const auth = await verifyCertSignedAction({
      wallet,
      action: 'proof',
      nonce: body.nonce,
      message: body.message,
      signature: body.signature
    });
    if (!auth.ok) return res.status(401).json({ ok: false, error: auth.error });

    if (action === 'code') {
      const kind = String(body.kind || '').toLowerCase();
      if (kind !== 'x' && kind !== 'web' && kind !== 'tg') {
        return res.status(400).json({ ok: false, error: 'kind must be x|tg|web' });
      }
      const issued = await issueProofCode({ serial, kind, hint: body.hint });
      return res.status(200).json({
        ok: true,
        code: issued.code,
        expiresAt: issued.expiresAt,
        instructions:
          kind === 'x'
            ? `Post a tweet containing exactly: ${issued.code} — then send the tweet URL`
            : kind === 'tg'
              ? `Add the Cyre bot as admin and put ${issued.code} in the chat description`
              : `Set DNS TXT cyre-verify=${issued.code} or host /.well-known/cyre.txt with that code`
      });
    }

    const kind = String(body.kind || '').toLowerCase();
    // Every proof uses a one-time code issued to THIS certificate: a code or post
    // made for another certificate can never be replayed here.
    const codeRecord = await loadProofCode(body.code);
    if (!codeRecord || codeRecord.serial !== serial || codeRecord.kind !== kind) {
      return res.status(400).json({ ok: false, error: 'proof code not issued for this certificate' });
    }
    let result;
    if (kind === 'x') {
      result = await verifyXProof({ code: body.code, tweetUrl: body.tweetUrl });
    } else if (kind === 'tg') {
      result = await verifyTelegramProof({
        chatId: body.chatId,
        display: body.display,
        code: String(body.code || '')
      });
    } else if (kind === 'web') {
      result = await verifyWebsiteProof({ domain: body.domain, code: body.code });
      if (result.ok && result.proof) {
        result.proof.meta = { ...(result.proof.meta || {}), code: body.code };
      }
    } else {
      return res.status(400).json({ ok: false, error: 'kind must be x|tg|web' });
    }

    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });

    const proof = result.proof;
    const taken = await getBindSerial(proof.kind, proof.id);
    let takenCert = taken && taken !== serial ? await getCertBySerial(taken) : null;
    // A dissolved certificate's slot can only be reused by the same owner wallet.
    if (takenCert && takenCert.status === 'REVOKED' && takenCert.ownerWallet === wallet) takenCert = null;
    if (takenCert) {
      return res.status(409).json({
        ok: false,
        error: 'platform account already bound to another certificate',
        serial: taken
      });
    }

    const proofs = Array.isArray(cert.proofs) ? [...cert.proofs] : [];
    const idx = proofs.findIndex((p) => p.kind === proof.kind && p.id === proof.id);
    if (idx >= 0) proofs[idx] = proof;
    else proofs.push(proof);
    cert.proofs = proofs;
    if (cert.status === 'PENDING_PROOF') cert.status = 'VALID';
    await saveCert(cert);
    await setBind(proof.kind, proof.id, serial);
    await appendCertEvent(serial, 'proof_added', { kind: proof.kind, id: proof.id });

    return res.status(200).json({ ok: true, cert: publicCertView(cert) });
  } catch (e) {
    console.error('cert proof failed', e && e.message);
    return res.status(500).json({ ok: false, error: (e && e.message) || 'proof failed' });
  }
}
