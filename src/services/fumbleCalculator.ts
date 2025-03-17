import axios from 'axios';
import { FumbleResult, FumbleTransaction } from '../models/Wallet';
import { logger } from '../config/logger';
import { AppError } from '../middleware/errorHandler';
import NodeCache from 'node-cache';

const CACHE_TTL = 86400; // 24 hours
const fumbleCache = new NodeCache({ stdTTL: CACHE_TTL });

interface TokenPrice {
  timestamp: string;
  price: number;
}

interface ZapperTransaction {
  hash: string;
  type: string;
  token: {
    symbol: string;
    id: string;
  };
  amount: number;
  timestamp: string;
}

interface Transaction {
  token: string;
  amount: number;
  price: number;
  timestamp: string;
}

export const calculateFumbles = async (address: string): Promise<FumbleResult> => {
  const cacheKey = `fumbles_${address.toLowerCase()}`;
  const cached = fumbleCache.get<FumbleResult>(cacheKey);

  if (cached) {
    logger.debug('Returning cached fumble calculation', {
      address,
      totalLoss: cached.totalLoss,
      jeetScore: cached.jeetScore
    });
    return cached;
  }

  try {
    logger.info('Starting fumble calculation', { address });

    // Get transactions from Zapper
    const zapperResponse = await axios.get(
      `https://api.zapper.fi/v1/transactions?address=${address}`,
      {
        headers: {
          'Authorization': `Basic ${process.env.ZAPPER_API_KEY}`
        }
      }
    );

    // Filter sell/swap transactions
    const sellTransactions = zapperResponse.data
      .filter((tx: ZapperTransaction) => tx.type === 'sell' || tx.type === 'swap');

    // Process each transaction
    const processedTransactions = await Promise.all(
      sellTransactions.map(async (tx: ZapperTransaction) => {
        const salePrice = await getPriceAtTimestamp(tx.token.id, tx.timestamp);
        const peakPrice = await getPeakPrice(tx.token.id, tx.timestamp);
        const loss = (peakPrice - salePrice) * tx.amount;

        return {
          hash: tx.hash,
          token: tx.token.symbol,
          amount: tx.amount,
          salePrice,
          peakPrice,
          loss: loss > 0 ? loss : 0,
          type: peakPrice > salePrice ? 'Early' : 'Late',
          timestamp: tx.timestamp
        } as FumbleTransaction;
      })
    );

    // Calculate total loss and jeet score
    const totalLoss = processedTransactions.reduce((sum, tx) => sum + tx.loss, 0);
    const maxPossible = processedTransactions.reduce((sum, tx) => sum + (tx.peakPrice * tx.amount), 0);
    const jeetScore = Math.round((totalLoss / maxPossible) * 100);

    const result: FumbleResult = {
      transactions: processedTransactions,
      totalLoss,
      jeetScore,
      rank: calculateRank(jeetScore)
    };

    logger.info('Fumble calculation completed', {
      address,
      totalLoss: result.totalLoss,
      transactionCount: result.transactions.length,
      jeetScore: result.jeetScore
    });

    // Cache the results
    fumbleCache.set(cacheKey, result);

    return result;
  } catch (error) {
    logger.error('Failed to calculate fumbles', {
      address,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw new AppError(500, 'Failed to calculate fumbles');
  }
};

async function getPriceAtTimestamp(tokenId: string, timestamp: string): Promise<number> {
  try {
    const date = new Date(timestamp).toISOString().split('T')[0];
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${tokenId}/history`,
      {
        params: {
          date,
          localization: false
        },
        headers: {
          'x-cg-pro-api-key': process.env.COINGECKO_API_KEY
        }
      }
    );

    return response.data.market_data.current_price.usd;
  } catch {
    return 0;
  }
}

async function getPeakPrice(tokenId: string, timestamp: string): Promise<number> {
  const date = new Date(timestamp);
  const thirtyDaysAfter = new Date(date.getTime() + 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysBefore = new Date(date.getTime() - 30 * 24 * 60 * 60 * 1000);

  try {
    const [beforePeak, afterPeak] = await Promise.all([
      getHighestPrice(tokenId, thirtyDaysBefore, date),
      getHighestPrice(tokenId, date, thirtyDaysAfter)
    ]);

    return Math.max(beforePeak, afterPeak);
  } catch {
    return 0;
  }
}

async function getHighestPrice(tokenId: string, from: Date, to: Date): Promise<number> {
  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${tokenId}/market_chart/range`,
      {
        params: {
          vs_currency: 'usd',
          from: Math.floor(from.getTime() / 1000),
          to: Math.floor(to.getTime() / 1000)
        },
        headers: {
          'x-cg-pro-api-key': process.env.COINGECKO_API_KEY
        }
      }
    );

    return Math.max(...response.data.prices.map((price: number[]) => price[1]));
  } catch {
    return 0;
  }
}

function calculateRank(jeetScore: number): number {
  if (jeetScore >= 90) return 1; // Diamond Hands (Ironic)
  if (jeetScore >= 70) return 2; // Paper Hands
  if (jeetScore >= 50) return 3; // Weak Hands
  if (jeetScore >= 30) return 4; // Shaky Hands
  return 5; // Normal Trader
} 