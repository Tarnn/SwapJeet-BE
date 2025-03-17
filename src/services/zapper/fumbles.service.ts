import axios from 'axios';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/errors';
import { ZAPPER_TRANSACTIONS_QUERY } from './queries';
import { ZapperTransaction, ZapperTransactionsResponse } from './types';

export interface FumbleResult {
  transactions: Array<{
    token: string;
    loss: number;
    type: 'Early' | 'Late';
    timestamp: string;
    price: number;
    peakPrice: number;
  }>;
  totalLoss: number;
  jeetScore: number;
}

interface Fumble {
  token: {
    symbol: string;
    address: string;
  };
  loss: number;
  type: 'Early' | 'Late';
  timestamp: string;
  price: number;
  peakPrice: number;
}

export async function getWalletFumbles(address: string, timeframe: '7d' | '30d' | '90d' | 'all' = '30d'): Promise<FumbleResult> {
  try {
    logger.debug('Fetching wallet fumbles from Zapper', { address, timeframe });
    
    const encodedKey = Buffer.from(process.env.ZAPPER_API_KEY || '').toString('base64');
    
    // Calculate the start date based on timeframe
    const now = new Date();
    const startDate = new Date();
    switch (timeframe) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case 'all':
        startDate.setFullYear(2015); // Start of Ethereum
        break;
    }

    // Fetch all transactions within the timeframe
    const transactions: ZapperTransaction[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage) {
      const response = await axios({
        url: 'https://public.zapper.xyz/graphql',
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${encodedKey}`
        },
        data: {
          query: ZAPPER_TRANSACTIONS_QUERY,
          variables: {
            address,
            first: 100,
            after: cursor,
            before: now.toISOString()
          }
        }
      });

      const zapperResponse = response.data as ZapperTransactionsResponse;

      if (zapperResponse.errors) {
        logger.error('GraphQL Errors from Zapper', { 
          errors: zapperResponse.errors,
          address 
        });
        throw new Error(`GraphQL Errors: ${JSON.stringify(zapperResponse.errors)}`);
      }

      const pageInfo = zapperResponse.data?.transactions?.pageInfo;
      const nodes = zapperResponse.data?.transactions?.nodes || [];

      transactions.push(...nodes);
      hasNextPage = pageInfo?.hasNextPage || false;
      cursor = pageInfo?.endCursor || null;
    }

    // Analyze transactions for fumbles
    const fumbles = analyzeFumbles(transactions, address);
    
    return {
      transactions: fumbles.map(fumble => ({
        token: fumble.token.symbol,
        loss: fumble.loss,
        type: fumble.type,
        timestamp: fumble.timestamp,
        price: fumble.price,
        peakPrice: fumble.peakPrice
      })),
      totalLoss: fumbles.reduce((sum, fumble) => sum + fumble.loss, 0),
      jeetScore: calculateJeetScore(fumbles)
    };

  } catch (error) {
    logger.error('Failed to get wallet fumbles', {
      error: error instanceof Error ? error.message : 'Unknown error',
      address,
      timeframe,
      stack: error instanceof Error ? error.stack : undefined
    });
    throw new AppError(500, 'Failed to get wallet fumbles');
  }
}

function analyzeFumbles(transactions: ZapperTransaction[], address: string): Fumble[] {
  const fumbles: Fumble[] = [];
  const tokenPriceHistory: { [key: string]: { price: number; timestamp: string }[] } = {};

  // First, build price history for each token
  transactions.forEach(tx => {
    if (!tokenPriceHistory[tx.token.address]) {
      tokenPriceHistory[tx.token.address] = [];
    }
    tokenPriceHistory[tx.token.address].push({
      price: tx.token.price,
      timestamp: tx.timestamp
    });
  });

  // Analyze each sell transaction
  transactions.forEach(tx => {
    // Only analyze outgoing transactions (sells)
    if (tx.from.address.toLowerCase() === address.toLowerCase()) {
      const priceHistory = tokenPriceHistory[tx.token.address];
      if (!priceHistory) return;

      // Find peak price after this transaction
      const peakPrice = Math.max(
        ...priceHistory
          .filter(p => new Date(p.timestamp) > new Date(tx.timestamp))
          .map(p => p.price)
      );

      // If peak price is significantly higher (e.g., 20% or more), it's a fumble
      if (peakPrice > tx.token.price * 1.2) {
        fumbles.push({
          token: {
            symbol: tx.token.symbol,
            address: tx.token.address
          },
          loss: (peakPrice - tx.token.price) * parseFloat(tx.amount),
          type: 'Early',
          timestamp: tx.timestamp,
          price: tx.token.price,
          peakPrice
        });
      }
    }
  });

  return fumbles.sort((a, b) => b.loss - a.loss);
}

function calculateJeetScore(fumbles: Fumble[]): number {
  if (fumbles.length === 0) return 0;

  const totalLoss = fumbles.reduce((sum, fumble) => sum + fumble.loss, 0);
  const maxScore = 100;
  const baseScore = Math.min(totalLoss / 1000, 1) * maxScore; // Scale based on $1000 loss
  const frequencyMultiplier = Math.min(fumbles.length / 10, 1); // Scale based on number of fumbles

  return Math.round(baseScore * frequencyMultiplier);
} 