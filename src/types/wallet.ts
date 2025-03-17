export interface Token {
  name: string;
  symbol: string;
  decimals: number;
  price: number;
  address: string;
  imgUrl: string | null;
}

export interface TokenBalance {
  network: string;
  balance: number;
  balanceUSD: number;
  token: {
    name: string;
    symbol: string;
    decimals: number;
    price: number;
    address: string;
    imgUrl: string | null;
  };
}

export interface WalletDetails {
  address: string;
  tokens: TokenBalance[];
  netWorth: number;
  topHoldings: TokenBalance[];
  tokenCount: number;
  lastUpdated: string;
}

export interface Wallet {
  userId: string;
  address: string;
  nickname?: string;
  tag: string;
  addedAt: string;
  isPinned: boolean;
  netWorthHistory: {
    timestamp: string;
    value: number;
  }[];
  tokens?: TokenBalance[];
}

// Zapper API Response Types
export interface ZapperTokenNode {
  name: string;
  symbol: string;
  price: number;
  tokenAddress: string;
  imgUrlV2: string | null;
  decimals: number;
  balanceRaw: string;
  balance: string;
  balanceUSD: number;
  network: {
    name: string;
  };
}

export interface ZapperTokenEdge {
  node: ZapperTokenNode;
}

export interface ZapperTokenBalances {
  totalBalanceUSD: number;
  byToken: {
    totalCount: number;
    edges: ZapperTokenEdge[];
  };
}

export interface ZapperPortfolioV2Response {
  portfolioV2: {
    tokenBalances: ZapperTokenBalances;
  };
} 