// api/_lanes.js — armed x402 lane names (no _x402 import — safe for monitor feed)

export function listArmedLaneNames() {
  const lanes = [];
  if (process.env.X402_PAY_TO) lanes.push('solana');
  if (process.env.X402_PAY_TO_BASE || '0x9Ff25C4acf1DcDDf15fD2702C127A285f1dFa712') lanes.push('base');
  if (process.env.X402_PAY_TO_BSC) lanes.push('bsc');
  return lanes;
}
