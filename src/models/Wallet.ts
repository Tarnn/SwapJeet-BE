export type WalletTag = 'Me' | 'Whale' | 'Friend' | 'Other';

export interface NetWorthHistory {
  timestamp: string;
  value: number;
}

export interface Wallet {
  userId: string;
  address: string;
  nickname?: string;
  tag: WalletTag;
  addedAt: string;
  isPinned: boolean;
  netWorthHistory: NetWorthHistory[];
  fumbles?: {
    totalLoss: number;
    transactions: FumbleTransaction[];
  };
}

export interface WalletDetails {
  address: string;
  tokens: Token[];
  netWorth: number;
  topGainer: TokenChange;
  topLoser: TokenChange;
}

export interface Token {
  symbol: string;
  name: string;
  address: string;
  balance: number;
  price: number;
  value: number;
  change24h: number;
}

export interface TokenChange {
  symbol: string;
  change24h: number;
}

export interface FumbleTransaction {
  hash: string;
  token: string;
  amount: number;
  salePrice: number;
  peakPrice: number;
  loss: number;
  type: 'Early' | 'Late';
  timestamp: string;
}

export interface FumbleResult {
  transactions: FumbleTransaction[];
  totalLoss: number;
  jeetScore: number;
  rank: number;
}

export interface AddWalletInput {
  address: string;
  nickname?: string;
  tag: WalletTag;
}

export interface UpdateWalletInput {
  nickname?: string;
  tag?: WalletTag;
  isPinned?: boolean;
} 