export interface ZapperTransaction {
  hash: string;
  type: string;
  timestamp: string;
  symbol: string;
  amount: string;
  amountUSD: number;
  token: {
    address: string;
    symbol: string;
    decimals: number;
    price: number;
  };
  to: {
    address: string;
  };
  from: {
    address: string;
  };
}

export interface ZapperTransactionsResponse {
  data?: {
    transactions?: {
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      nodes: ZapperTransaction[];
    };
  };
  errors?: Array<{ message: string }>;
}

export interface ZapperPortfolioV2Response {
  portfolioV2?: {
    tokenBalances: {
      totalBalanceUSD: number;
      byToken: {
        totalCount: number;
        edges: Array<{
          node: ZapperTokenNode;
        }>;
      };
    };
  };
  errors?: Array<{ message: string }>;
}

export interface ZapperTokenNode {
  name: string;
  symbol: string;
  price: number;
  tokenAddress: string;
  imgUrlV2?: string;
  decimals: number;
  balanceRaw: string;
  balance: string;
  balanceUSD: number;
  network: {
    name: string;
  };
} 