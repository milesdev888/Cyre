// api/badge-order-watch.js — Thin entry; watch logic lives in badge-order.js so create/status/watch
// share one serverless function (warm /tmp) when Redis is unset. Prefer the rewrite to
// /api/badge-order?watch=1; this file remains for direct /api/badge-order-watch hits.

export { default } from './badge-order.js';
