// api/_lockers.js — locker / burn config for token scanner v2 (no filesystem read).
// Edit this file when locker program IDs change — do not hardcode elsewhere.

export const LOCKERS = {
  version: 1,
  burnAddresses: [
    '11111111111111111111111111111111',
    '1nc1nerator11111111111111111111111111111111',
    'dead111111111111111111111111111111111111111',
    'Burn111111111111111111111111111111111111111'
  ],
  lockerPrograms: [
    { id: 'LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn', name: 'Jupiter Lock' },
    { id: 'strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m', name: 'Streamflow' },
    { id: 'aSTRM2NKoKxNnkmLWk9sz3k74gKBk9t7bpPrTGxMszH', name: 'Streamflow Aligned' },
    { id: 'strmRqUCoQkeZbZyeFyBTvzmU9aNSv1VqdAdybM73Vv', name: 'Streamflow (legacy index)' },
    { id: 'GokivDYuQXPZCWRkwMhdH2h91KpDQXBEmpgBgs55bnpH', name: 'Goki Smart Wallet' },
    { id: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', name: 'Raydium' },
    { id: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', name: 'Raydium CLMM' },
    { id: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C', name: 'Raydium CPMM' },
    { id: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc', name: 'Orca Whirlpool' },
    { id: 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', name: 'Meteora DLMM' }
  ],
  lockerTypes: {
    jupiter_locker: 'Jupiter Lock',
    raydium_locker: 'Raydium',
    streamflow: 'Streamflow',
    goki: 'Goki',
    uncx: 'UNCX',
    team_finance: 'Team Finance',
    meteora_locker: 'Meteora',
    orca_locker: 'Orca',
    bags_locker: 'Bags'
  },
  poolAccountTypes: ['AMM', 'POOL', 'VAULT', 'MARKET']
};
