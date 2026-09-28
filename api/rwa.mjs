export default async function handler(req, res) {
  const KEY = process.env.COINGECKO_API_KEY || '';
  const H = { accept: 'application/json' };
  if (KEY) H['x-cg-demo-api-key'] = KEY;

      const IDS = 'chainlink,ondo-finance,pax-gold,syrup,centrifuge-2';


  const B = 'https://api.coingecko.com/api/v3';

  try {
    const u = B + '/coins/markets?vs_currency=usd&ids=' + IDS + '&order=market_cap_desc&per_page=6&page=1&sparkline=false';
    const r = await fetch(u, { headers: H });
    if (!r.ok) {
      const t = await r.text();
      return res.status(200).json({ ok: false, status: r.status, body: t.slice(0, 200) });
    }
    const list = await r.json();
    const assets = list.map(function (c) {
      return { name: c.name, symbol: String(c.symbol || '').toUpperCase(), price: c.current_price, change24h: c.price_change_percentage_24h };
    });
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ ok: true, sector: null, assets: assets, updatedAt: new Date().toISOString(), source: 'CoinGecko' });
  } catch (e) {
    return res.status(200).json({ ok: false, message: String(e && e.message) });
  }
}
