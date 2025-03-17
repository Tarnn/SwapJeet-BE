import NodeCache from 'node-cache';

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
  WALLET_DETAILS: 300, // 5 minutes
  LEADERBOARD: 600,    // 10 minutes
  WALLET_UPDATES: 60   // 1 minute
} as const;

// Cache instances
export const walletDetailsCache = new NodeCache({
  stdTTL: CACHE_TTL.WALLET_DETAILS,
  checkperiod: 120
});

export const leaderboardCache = new NodeCache({
  stdTTL: CACHE_TTL.LEADERBOARD,
  checkperiod: 120
});

export const walletUpdatesCache = new NodeCache({
  stdTTL: CACHE_TTL.WALLET_UPDATES,
  checkperiod: 30
}); 