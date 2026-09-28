// api/_badge-notify.js — Optional Telegram notify for badge auto-issue / flagged holds.
// No-op when TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID unset.

const SITE = process.env.GUARDIAN_SITE_URL || 'https://cyre.dev';

/**
 * Post a plain-text Telegram message if credentials are configured.
 * @param {string} text
 * @returns {Promise<{ sent: boolean, skipped?: boolean, error?: string }>}
 */
export async function notifyTelegram(text) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId) {
    return { sent: false, skipped: true };
  }
  const body = String(text || '').slice(0, 3900);
  if (!body) return { sent: false, skipped: true };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: body,
        disable_web_page_preview: true
      })
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error('badge telegram notify failed', r.status, t.slice(0, 200));
      return { sent: false, error: `telegram HTTP ${r.status}` };
    }
    return { sent: true };
  } catch (e) {
    console.error('badge telegram notify error', e && e.message);
    return { sent: false, error: (e && e.message) || String(e) };
  }
}

/**
 * Notify founder channel of an auto-issued badge.
 * @param {{ order: object, badge: object, verifyUrl?: string }} opts
 */
export async function notifyBadgeAutoIssued({ order, badge, verifyUrl }) {
  const o = order || {};
  const b = badge || {};
  const verify = verifyUrl || (b.serial ? `${SITE}/verify/${b.serial}` : '');
  const lines = [
    'Guardian Verified · AUTO-ISSUED',
    `${o.name || '?'} ($${o.symbol || '?'})`,
    `mint ${o.mint || '?'}`,
    `order ${o.id || '?'}`,
    `serial ${b.serial || '?'}`,
    verify ? `verify ${verify}` : null,
    o.paymentLane ? `lane ${o.paymentLane}` : null,
    o.paymentTx ? `tx ${o.paymentTx}` : null
  ].filter(Boolean);
  return notifyTelegram(lines.join('\n'));
}

/**
 * Notify founder channel of a name-screen hold (pending founder).
 * @param {{ order: object, flags?: string[], reason?: string }} opts
 */
export async function notifyBadgeFlaggedHold({ order, flags, reason }) {
  const o = order || {};
  const flagList = Array.isArray(flags) ? flags : (o.screenFlags && o.screenFlags.flags) || [];
  const lines = [
    'Guardian Verified · FLAGGED hold',
    `${o.name || '?'} ($${o.symbol || '?'})`,
    `mint ${o.mint || '?'}`,
    `order ${o.id || '?'}`,
    reason || (o.screenFlags && o.screenFlags.reason) || 'name-screen flagged',
    flagList.length ? `flags: ${flagList.join(', ')}` : null,
    o.paymentLane ? `lane ${o.paymentLane}` : null,
    o.paymentTx ? `tx ${o.paymentTx}` : null,
    o.statusUrl ? `order ${o.statusUrl}` : null
  ].filter(Boolean);
  return notifyTelegram(lines.join('\n'));
}
