// swap-config.js — public Jupiter Plugin config for cyre.dev/scan
// After creating a referral account at https://referral.jup.ag/ (treasury wallet signs),
// paste the pubkey below. Until set, swap UI shows a setup notice (scan still works).

window.CYRE_SWAP_CONFIG = {
  referralAccount: '7xf6wecNGamSc1JrpBKjwZUBSc8Jb9oRTvFLYB8f6SMf',
  referralFeeBps: 50,
  scanGateMinutes: 10,
  solMint: 'So11111111111111111111111111111111111111112',
  branding: {
    name: 'CYRE Guardian',
    logoUri: 'https://cyre.dev/c7-cobra-512.png?v=c7g2',
  },
  pluginScript: 'https://plugin.jup.ag/plugin-v1.js',
};
