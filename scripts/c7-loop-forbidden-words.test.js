/**
 * Hard rule: The $C7 Loop section must not use investment-speak.
 * Approved copy may include "$25 USDC", "$20 in $C7", and "$C7".
 * Forbidden (standalone claims / words): price, profit, returns, moon, investment
 * (and close variants). Scopes only to #c7-loop markup — page footer disclosure
 * is intentionally left alone.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'tokenomics.html'), 'utf8');

const start = html.indexOf('id="c7-loop"');
assert.ok(start >= 0, 'tokenomics.html must contain id="c7-loop"');

const openIdx = html.lastIndexOf('<', start);
const sectionStart = html.indexOf('>', openIdx) + 1;
// Prefer matching the section element that opens with id="c7-loop"
const tagOpen = html.lastIndexOf('<section', start);
assert.ok(tagOpen >= 0 && tagOpen < start, 'c7-loop must be a <section>');
const sectionEnd = html.indexOf('</section>', start);
assert.ok(sectionEnd > start, 'c7-loop section must close');
const markup = html.slice(tagOpen, sectionEnd + '</section>'.length);

const required = [
  'THE $C7 LOOP',
  'Every Guardian Verified badge paid in C7 removes supply forever',
  'SCAN',
  'Project runs a Guardian scan',
  'QUALIFY',
  'LP locked · authorities revoked · grade earned',
  'BADGE',
  'Pays $25 USDC — or $20 in $C7',
  'BURN',
  'All C7 payments burned weekly · tx published',
  'SUPPLY SHRINKS',
  '100M fixed — burned tokens never return',
  'Verify any badge: cyre.dev/verify/‹serial› · every burn tx is published on this page',
];
for (const phrase of required) {
  assert.ok(markup.includes(phrase), `missing verbatim copy: ${phrase}`);
}

// Word-boundary check; allow $C7 / USDC amounts and approved "never return".
// Ban investment-speak: price, profit, returns, moon, investment (+ close variants).
const forbidden = /\b(price|prices|priced|profit|profits|profitable|returns|moon|mooning|investment|invest|investing|investor|investors)\b/i;
const hit = markup.match(forbidden);
assert.equal(
  hit,
  null,
  `forbidden investment-speak in #c7-loop: "${hit && hit[0]}"`
);

// Mobile breakpoint must stack under 720px with no horizontal scroll intent.
assert.ok(
  /@media\s*\(\s*max-width\s*:\s*720px\s*\)[\s\S]*?\.c7-loop-flow\s*\{[^}]*flex-direction\s*:\s*column/i.test(html),
  'mobile CSS under 720px must stack .c7-loop-flow vertically'
);

console.log('c7-loop-forbidden-words.test.js: ok');
