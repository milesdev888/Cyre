#!/usr/bin/env node
// No secrets. Poll CDP Bazaar + Agentic Market for CYRE Guardian listing.
// Usage: node scripts/check-bazaar.js

const PAY_TO = '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712';
const CDP_URL =
  `https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?payTo=${PAY_TO}`;
const AGENTIC_URL =
  'https://api.agentic.market/v1/services/search?q=' + encodeURIComponent('cyre');

async function getJson(url) {
  const r = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'cyre-bazaar-check/1.0' }
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    throw new Error(`${url} → HTTP ${r.status}, non-JSON: ${text.slice(0, 120)}`);
  }
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}: ${text.slice(0, 200)}`);
  return data;
}

function isCyreHit(blob) {
  const s = JSON.stringify(blob).toLowerCase();
  return s.includes('cyre.dev') || s.includes('cyre guardian') || s.includes('"cyre"');
}

function resourceUrl(item) {
  return (
    item.url ||
    item.resource ||
    item.resourceUrl ||
    (item.endpoints && item.endpoints[0] && item.endpoints[0].url) ||
    item.name ||
    item.id ||
    '(unknown)'
  );
}

async function checkCdp() {
  const data = await getJson(CDP_URL);
  const items = data.items || data.resources || [];
  const hits = items.filter(isCyreHit);
  // payTo filter is often ignored by CDP; also scan for our treasury in accepts
  const byPayTo = items.filter((it) => {
    const s = JSON.stringify(it).toLowerCase();
    return s.includes(PAY_TO.toLowerCase());
  });
  console.log('CDP Bazaar');
  console.log('  URL:', CDP_URL);
  console.log('  items returned:', items.length);
  console.log('  cyre hits:', hits.length);
  console.log('  payTo hits:', byPayTo.length);
  for (const h of [...hits, ...byPayTo.filter((x) => !hits.includes(x))]) {
    console.log('   -', resourceUrl(h));
  }
  return { hits, byPayTo, items };
}

async function checkAgentic() {
  const data = await getJson(AGENTIC_URL);
  const services = data.services || data.items || (Array.isArray(data) ? data : []);
  const hits = services.filter(isCyreHit);
  console.log('Agentic Market');
  console.log('  URL:', AGENTIC_URL);
  console.log('  results:', services.length);
  console.log('  cyre hits:', hits.length);
  for (const h of hits) {
    console.log('   -', resourceUrl(h));
    for (const ep of h.endpoints || []) {
      console.log('      ', ep.method || '?', ep.url);
    }
  }
  return { hits, services };
}

async function main() {
  console.log('CYRE Bazaar listing check —', new Date().toISOString());
  console.log('payTo:', PAY_TO);
  console.log('');
  const cdp = await checkCdp();
  console.log('');
  const agentic = await checkAgentic();
  console.log('');
  const listed = cdp.hits.length + cdp.byPayTo.length + agentic.hits.length > 0;
  console.log(listed ? 'STATUS: listed (at least one hit)' : 'STATUS: not listed yet');
  process.exit(listed ? 0 : 2);
}

main().catch((err) => {
  console.error('check-bazaar failed:', err.message || err);
  process.exit(1);
});
