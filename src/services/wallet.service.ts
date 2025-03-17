import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import axios, { AxiosResponse } from 'axios';
import NodeCache from 'node-cache';
import { AppError } from '../middleware/errorHandler';
import { validateTag } from '../utils/validation';
import { generateFumbleImage } from '../utils/image';
import { logger } from '../config/logger';
import { WalletDetails, ZapperPortfolioV2Response, TokenBalance, ZapperTokenNode } from '../types/wallet';

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || 'local',
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'local',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'local'
  }
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({ region: process.env.AWS_REGION });

const WALLETS_TABLE = process.env.WALLETS_TABLE || 'wallets';
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
  tokens?: any[];
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

const ZAPPER_GRAPHQL_QUERY = `
  query providerPortfolioQuery($addresses: [Address!]!, $networks: [Network!]!) {
    portfolio(addresses: $addresses, networks: $networks) {
      tokenBalances {
        address
        network
        token {
          balance
          balanceUSD
          baseToken {
            name
            symbol
          }
        }
      }
    }
  }
`;

const ZAPPER_PORTFOLIO_QUERY = `
  query Portfolio($addresses: [Address!]!, $first: Int!) {
    portfolioV2(addresses: $addresses) {
      tokenBalances {
        totalBalanceUSD
        byToken(first: $first) {
          totalCount
          edges {
            node {
              name
              symbol
              price
              tokenAddress
              imgUrlV2
              decimals
              balanceRaw
              balance
              balanceUSD
              network {
                name
              }
            }
          }
        }
      }
    }
  }
`;

interface GraphQLResponse {
  data: ZapperPortfolioV2Response;
  errors?: Array<{ message: string }>;
}

export const addWallet = async (
  userId: string,
  input: { address: string; nickname?: string; tag: string }
): Promise<Wallet> => {
  try {
    logger.debug('Adding wallet', { userId, address: input.address, tag: input.tag });

    // Validate wallet exists on Zapper
    try {
      logger.debug('Fetching wallet data from Zapper', { address: input.address });
      
      const zapperResponse = await axios({
        url: 'https://public.zapper.xyz/graphql',
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
          'x-zapper-api-key': process.env.ZAPPER_API_KEY
        },
        data: {
          query: ZAPPER_GRAPHQL_QUERY,
          variables: {
            addresses: [input.address],
            networks: ['ETHEREUM_MAINNET']
          }
        }
      });

      logger.debug('Zapper API response', { 
        status: zapperResponse.status,
        hasData: !!zapperResponse.data,
        data: zapperResponse.data
      });

      if (zapperResponse.data.errors) {
        logger.error('GraphQL Errors', { errors: zapperResponse.data.errors });
        throw new Error(`GraphQL Errors: ${JSON.stringify(zapperResponse.data.errors)}`);
      }

      const portfolio = zapperResponse.data.data.portfolio;
      if (!portfolio || !portfolio.tokenBalances || portfolio.tokenBalances.length === 0) {
        throw new AppError(400, 'Invalid or empty wallet');
      }

      // Calculate total balance across all tokens
      const totalBalance = portfolio.tokenBalances.reduce((sum: number, balance: any) => {
        return sum + (balance.token.balanceUSD || 0);
      }, 0);

      if (!validateTag(input.tag)) {
        throw new AppError(400, 'Invalid tag');
      }

      const wallet: Wallet = {
        userId,
        address: input.address.toLowerCase(),
        nickname: input.nickname,
        tag: input.tag,
        addedAt: new Date().toISOString(),
        isPinned: false,
        netWorthHistory: [{
          timestamp: new Date().toISOString(),
          value: totalBalance
        }]
      };

      logger.debug('Saving wallet to DynamoDB', { userId, address: input.address });
      await docClient.send(new PutCommand({
        TableName: WALLETS_TABLE,
        Item: wallet,
        ConditionExpression: 'attribute_not_exists(userId) AND attribute_not_exists(address)'
      }));

      logger.info('Wallet added successfully', { userId, address: input.address });
      return wallet;
    } catch (zapperError: any) {
      logger.error('Zapper API error', { 
        error: zapperError instanceof Error ? zapperError.message : 'Unknown error',
        address: input.address,
        stack: zapperError instanceof Error ? zapperError.stack : undefined,
        response: zapperError.response?.data
      });
      throw new AppError(500, 'Failed to validate wallet with Zapper');
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Failed to add wallet', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      address: input.address,
      stack: error instanceof Error ? error.stack : undefined
    });
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

export const getWalletDetails = async (address: string, refresh: boolean = false): Promise<WalletDetails> => {
  const cacheKey = `wallet_details_${address}`;
  const cached = !refresh && walletCache.get<WalletDetails>(cacheKey);
  
  if (cached) {
    return cached;
  }

  try {
    logger.debug('Fetching wallet details from Zapper', { address, refresh });
    
    const encodedKey = Buffer.from(process.env.ZAPPER_API_KEY || '').toString('base64');
    
    const zapperResponse = await axios({
      url: 'https://public.zapper.xyz/graphql',
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${encodedKey}`
      },
      data: {
        query: ZAPPER_PORTFOLIO_QUERY,
        variables: {
          addresses: [address],
          first: 100 // Get first 100 tokens
        }
      }
    }) as AxiosResponse<GraphQLResponse>;

    logger.debug('Zapper API raw response', {
      status: zapperResponse.status,
      statusText: zapperResponse.statusText,
      data: zapperResponse.data
    });

    if (zapperResponse.data.errors) {
      logger.error('GraphQL Errors from Zapper', { 
        errors: zapperResponse.data.errors,
        address 
      });
      throw new Error(`GraphQL Errors: ${JSON.stringify(zapperResponse.data.errors)}`);
    }

    const portfolio = zapperResponse.data?.data?.portfolioV2;
    if (!portfolio?.tokenBalances) {
      logger.error('Invalid Zapper response structure', { 
        responseData: zapperResponse.data,
        address 
      });
      throw new AppError(400, 'Invalid or empty wallet');
    }

    // Process token balances
    const tokens: TokenBalance[] = portfolio.tokenBalances.byToken.edges.map(({ node }: { node: ZapperTokenNode }) => ({
      network: node.network.name,
      balance: parseFloat(node.balance) || 0,
      balanceUSD: node.balanceUSD || 0,
      token: {
        name: node.name,
        symbol: node.symbol,
        decimals: node.decimals,
        price: node.price || 0,
        address: node.tokenAddress,
        imgUrl: node.imgUrlV2
      }
    }));

    const netWorth = portfolio.tokenBalances.totalBalanceUSD || 0;

    // Sort tokens by USD value for top holdings
    const sortedTokens = [...tokens].sort((a, b) => (b.balanceUSD || 0) - (a.balanceUSD || 0));
    const topTokens = sortedTokens.slice(0, 5); // Get top 5 holdings

    const details: WalletDetails = {
      address,
      tokens,
      netWorth,
      topHoldings: topTokens,
      tokenCount: portfolio.tokenBalances.byToken.totalCount || tokens.length,
      lastUpdated: new Date().toISOString()
    };

    logger.debug('Processed wallet details', { 
      tokenCount: details.tokenCount,
      netWorth: details.netWorth,
      address 
    });

    walletCache.set(cacheKey, details);
    return details;
  } catch (error) {
    logger.error('Failed to get wallet details', {
      error: error instanceof Error ? error.message : 'Unknown error',
      address,
      stack: error instanceof Error ? error.stack : undefined,
      response: error instanceof Error && 'response' in error ? (error as any).response?.data : undefined,
      apiKey: process.env.ZAPPER_API_KEY ? 'Present' : 'Missing'
    });
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

export const getWallets = async (userId: string): Promise<Wallet[]> => {
  try {
    logger.debug('Fetching wallets from DynamoDB', { userId });
    
    const response = await docClient.send(new QueryCommand({
      TableName: WALLETS_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId
      }
    }));

    const wallets = response.Items as Wallet[];
    
    // Fetch current token balances for all wallets
    try {
      const addresses = wallets.map(w => w.address);
      logger.debug('Fetching current token balances from Zapper', { addresses });
      
      const zapperResponse = await axios({
        url: 'https://public.zapper.xyz/graphql',
        method: 'post',
        headers: {
          'Content-Type': 'application/json',
          'x-zapper-api-key': process.env.ZAPPER_API_KEY
        },
        data: {
          query: ZAPPER_PORTFOLIO_QUERY,
          variables: {
            addresses,
            networks: ['ETHEREUM_MAINNET']
          }
        }
      });

      // Update wallets with current token data
      if (zapperResponse.data?.data?.portfolio?.tokenBalances) {
        const tokenBalancesByAddress = zapperResponse.data.data.portfolio.tokenBalances.reduce((acc: any, balance: any) => {
          if (!acc[balance.address]) {
            acc[balance.address] = [];
          }
          acc[balance.address].push({
            network: balance.token.baseToken.network,
            balance: balance.token.balance,
            balanceUSD: balance.token.balanceUSD,
            token: {
              name: balance.token.baseToken.name,
              symbol: balance.token.baseToken.symbol,
              decimals: balance.token.baseToken.decimals,
              price: balance.token.baseToken.price,
              address: balance.token.baseToken.address
            }
          });
          return acc;
        }, {});

        // Add token data to each wallet
        wallets.forEach(wallet => {
          wallet.tokens = tokenBalancesByAddress[wallet.address] || [];
          // Update latest net worth
          const totalBalance = wallet.tokens.reduce((sum, token) => sum + (token.balanceUSD || 0), 0);
          wallet.netWorthHistory.push({
            timestamp: new Date().toISOString(),
            value: totalBalance
          });
        });
      }
    } catch (zapperError: any) {
      logger.error('Failed to fetch token balances', {
        error: zapperError instanceof Error ? zapperError.message : 'Unknown error',
        stack: zapperError instanceof Error ? zapperError.stack : undefined
      });
      // Continue with stored wallet data even if Zapper fetch fails
    }

    return wallets;
  } catch (error) {
    logger.error('Failed to get wallets', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      stack: error instanceof Error ? error.stack : undefined
    });
    throw new AppError(500, 'Failed to get wallets');
  }
}; 