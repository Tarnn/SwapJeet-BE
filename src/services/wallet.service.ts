import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import NodeCache from 'node-cache';
import { AppError } from '../middleware/errorHandler';
import { validateTag } from '../utils/validation';
import { generateFumbleImage } from '../utils/image';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({ region: process.env.AWS_REGION });

const WALLETS_TABLE = `${process.env.DYNAMODB_TABLE_PREFIX}wallets`;
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '900'); // 15 minutes

const walletCache = new NodeCache({
  stdTTL: CACHE_TTL,
  checkperiod: 120
});

interface Wallet {
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
}

interface WalletDetails {
  address: string;
  tokens: any[];
  netWorth: number;
  topGainer: {
    symbol: string;
    change24h: number;
  };
  topLoser: {
    symbol: string;
    change24h: number;
  };
}

interface FumbleResult {
  transactions: {
    hash: string;
    token: string;
    amount: number;
    salePrice: number;
    peakPrice: number;
    loss: number;
    type: 'Early' | 'Late';
    timestamp: string;
  }[];
  totalLoss: number;
  jeetScore: number;
  rank: number;
}

export const addWallet = async (
  userId: string,
  input: { address: string; nickname?: string; tag: string }
): Promise<Wallet> => {
  try {
    // Validate wallet exists on Zapper
    const zapperResponse = await axios.get(
      `https://api.zapper.fi/v1/balances/tokens?addresses[]=${input.address}`,
      {
        headers: {
          'Authorization': `Basic ${process.env.ZAPPER_API_KEY}`
        }
      }
    );

    if (!zapperResponse.data || !zapperResponse.data[input.address]) {
      throw new AppError(400, 'Invalid or empty wallet');
    }

    if (!validateTag(input.tag)) {
      throw new AppError(400, 'Invalid tag');
    }

    const wallet: Wallet = {
      userId,
      address: input.address,
      nickname: input.nickname,
      tag: input.tag,
      addedAt: new Date().toISOString(),
      isPinned: false,
      netWorthHistory: [{
        timestamp: new Date().toISOString(),
        value: zapperResponse.data[input.address].total
      }]
    };

    await docClient.send(new PutCommand({
      TableName: WALLETS_TABLE,
      Item: wallet,
      ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(address)'
    }));

    return wallet;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(500, 'Failed to add wallet');
  }
};

export const removeWallet = async (userId: string, address: string): Promise<void> => {
  try {
    await docClient.send(new DeleteCommand({
      TableName: WALLETS_TABLE,
      Key: {
        userId,
        address
      }
    }));
  } catch (error) {
    throw new AppError(500, 'Failed to remove wallet');
  }
};

export const updateWallet = async (
  userId: string,
  address: string,
  updates: { nickname?: string; tag?: string; isPinned?: boolean }
): Promise<Wallet> => {
  try {
    const wallet = await getWallet(userId, address);
    if (!wallet) {
      throw new AppError(404, 'Wallet not found');
    }

    if (updates.tag && !validateTag(updates.tag)) {
      throw new AppError(400, 'Invalid tag');
    }

    const updatedWallet: Wallet = {
      ...wallet,
      ...updates
    };

    await docClient.send(new PutCommand({
      TableName: WALLETS_TABLE,
      Item: updatedWallet
    }));

    return updatedWallet;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(500, 'Failed to update wallet');
  }
};

export const getWallet = async (userId: string, address: string): Promise<Wallet | null> => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: WALLETS_TABLE,
      Key: {
        userId,
        address
      }
    }));

    return result.Item as Wallet || null;
  } catch (error) {
    throw new AppError(500, 'Failed to get wallet');
  }
};

export const getUserWallets = async (userId: string): Promise<Wallet[]> => {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: WALLETS_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }));

    return result.Items as Wallet[] || [];
  } catch (error) {
    throw new AppError(500, 'Failed to get user wallets');
  }
};

export const getWalletDetails = async (address: string): Promise<WalletDetails> => {
  const cacheKey = `wallet_details_${address}`;
  const cached = walletCache.get<WalletDetails>(cacheKey);
  
  if (cached) {
    return cached;
  }

  try {
    const zapperResponse = await axios.get(
      `https://api.zapper.fi/v1/balances/tokens?addresses[]=${address}`,
      {
        headers: {
          'Authorization': `Basic ${process.env.ZAPPER_API_KEY}`
        }
      }
    );

    if (!zapperResponse.data || !zapperResponse.data[address]) {
      throw new AppError(400, 'Invalid or empty wallet');
    }

    const tokens = zapperResponse.data[address].tokens;
    const netWorth = zapperResponse.data[address].total;

    // Calculate top gainer and loser
    const sortedTokens = [...tokens].sort((a, b) => b.change24h - a.change24h);
    const topGainer = sortedTokens[0];
    const topLoser = sortedTokens[sortedTokens.length - 1];

    const details: WalletDetails = {
      address,
      tokens,
      netWorth,
      topGainer: {
        symbol: topGainer.symbol,
        change24h: topGainer.change24h
      },
      topLoser: {
        symbol: topLoser.symbol,
        change24h: topLoser.change24h
      }
    };

    walletCache.set(cacheKey, details);
    return details;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(500, 'Failed to get wallet details');
  }
};

export const getWalletFumbles = async (address: string): Promise<FumbleResult> => {
  const cacheKey = `wallet_fumbles_${address}`;
  const cached = walletCache.get<FumbleResult>(cacheKey);
  
  if (cached) {
    return cached;
  }

  try {
    // Get transactions from Zapper
    const zapperResponse = await axios.get(
      `https://api.zapper.fi/v1/transactions?address=${address}`,
      {
        headers: {
          'Authorization': `Basic ${process.env.ZAPPER_API_KEY}`
        }
      }
    );

    // Process transactions and calculate fumbles
    const transactions = zapperResponse.data
      .filter((tx: any) => tx.type === 'sell' || tx.type === 'swap')
      .map(async (tx: any) => {
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
        };
      });

    const processedTransactions = await Promise.all(transactions);
    const totalLoss = processedTransactions.reduce((sum, tx) => sum + tx.loss, 0);
    const maxPossible = processedTransactions.reduce((sum, tx) => sum + (tx.peakPrice * tx.amount), 0);
    const jeetScore = Math.round((totalLoss / maxPossible) * 100);

    const result: FumbleResult = {
      transactions: processedTransactions,
      totalLoss,
      jeetScore,
      rank: calculateRank(jeetScore)
    };

    walletCache.set(cacheKey, result);
    return result;
  } catch (error) {
    throw new AppError(500, 'Failed to calculate fumbles');
  }
};

export const exportFumbles = async (userId: string, address: string): Promise<string> => {
  try {
    const fumbles = await getWalletFumbles(address);
    const wallet = await getWallet(userId, address);

    if (!wallet) {
      throw new AppError(404, 'Wallet not found');
    }

    // Generate PNG using canvas
    const imageBuffer = await generateFumbleImage(fumbles, wallet);

    // Upload to S3
    const key = `fumbles/${userId}/${address}/${Date.now()}.png`;
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: imageBuffer,
      ContentType: 'image/png'
    }));

    // Return presigned URL
    return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(500, 'Failed to export fumbles');
  }
};

// Helper functions
async function getPriceAtTimestamp(tokenId: string, timestamp: string): Promise<number> {
  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${tokenId}/history`,
      {
        params: {
          date: new Date(timestamp).toLocaleDateString('en-US'),
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