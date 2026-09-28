/**
 * Hard rule: paid-path checkout copy uses locked vocabulary and no investment-speak.
 * Scopes to order-page HTML body + badges; burn ledger must say burned weekly.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const orderSrc = readFileSync(join(root, 'api/order-page.js'), 'utf8');
const badges = readFileSync(join(root, 'badges.html'), 'utf8');
const burnApi = readFileSync(join(root, 'api/badge-burn-ledger.js'), 'utf8');

const htmlStart = orderSrc.indexOf('const html = `');
assert.ok(htmlStart >= 0, 'order-page must define html template');
const html = orderSrc.slice(htmlStart);

for (const [name, text] of [
  ['order-page-html', html],
  ['badges', badges]
]) {
  assert.match(text, /locked/i, `${name} must use locked vocabulary`);
  const hit = text.match(/\b(profit|profits|profitable|returns|moon|mooning)\b/i);
  assert.equal(hit, null, `${name} forbidden investment-speak: ${hit && hit[0]}`);
}

const burnHit = burnApi.match(/\b(profit|profits|profitable|returns|moon|mooning)\b/i);
assert.equal(burnHit, null, `burn-ledger forbidden investment-speak: ${burnHit && burnHit[0]}`);
assert.match(html, /not investment advice/);
assert.match(html, /\$25 USDC|USDC_USD/);
assert.match(burnApi, /burned weekly/i);

console.log('badge-order-forbidden-words.test.js: ok');
