// GET /api/monitor/feed — public x402 traffic window (free, no gate, CORS open)

import { listArmedLaneNames } from './_lanes.js';
import { buildMonitorFeed } from './_traffic.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Cache-Control', 'public, max-age=10');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Use GET' });
  }

  try {
    const feed = await buildMonitorFeed(listArmedLaneNames);
    if (req.method === 'HEAD') return res.status(200).end();
    return res.status(200).json(feed);
  } catch (e) {
    console.error('monitor feed error', e && e.message);
    return res.status(500).json({
      error: 'Monitor feed unavailable',
      detail: String((e && e.message) || e).slice(0, 200),
      generatedAt: new Date().toISOString()
    });
  }
}
