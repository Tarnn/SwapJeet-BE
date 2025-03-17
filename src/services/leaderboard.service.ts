import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import NodeCache from 'node-cache';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION
});

const docClient = DynamoDBDocumentClient.from(client);
const WALLETS_TABLE = `${process.env.DYNAMODB_TABLE_PREFIX}wallets`;
const USERS_TABLE = `${process.env.DYNAMODB_TABLE_PREFIX}users`;
const CACHE_TTL = parseInt(process.env.LEADERBOARD_CACHE_TTL || '3600'); // 1 hour

const leaderboardCache = new NodeCache({
  stdTTL: CACHE_TTL,
  checkperiod: 120
});

interface LeaderboardEntry {
  userId: string;
  displayName: string;
  totalFumbles: number;
  biggestFumble: {
    token: string;
    loss: number;
  };
  walletCount: number;
  rank: number;
}

export const getLeaderboard = async (): Promise<LeaderboardEntry[]> => {
  const cacheKey = 'global_leaderboard';
  const cached = leaderboardCache.get<LeaderboardEntry[]>(cacheKey);

  if (cached) {
    logger.debug('Returning cached global leaderboard');
    return cached;
  }

  try {
    logger.info('Fetching global leaderboard from database');
    // Get all users who have opted into the leaderboard
    const usersResponse = await docClient.send(new ScanCommand({
      TableName: USERS_TABLE,
      FilterExpression: 'prefs.showLeaderboard = :show',
      ExpressionAttributeValues: {
        ':show': true
      }
    }));

    const users = usersResponse.Items || [];

    // Get wallet data for each user
    const leaderboardData = await Promise.all(
      users.map(async (user) => {
        const walletsResponse = await docClient.send(new ScanCommand({
          TableName: WALLETS_TABLE,
          FilterExpression: 'userId = :userId',
          ExpressionAttributeValues: {
            ':userId': user.userId
          }
        }));

        const wallets = walletsResponse.Items || [];
        let totalFumbles = 0;
        let biggestFumble = { token: '', loss: 0 };

        wallets.forEach(wallet => {
          if (wallet.fumbles) {
            totalFumbles += wallet.fumbles.totalLoss;
            if (wallet.fumbles.transactions) {
              const maxFumble = wallet.fumbles.transactions.reduce(
                (max, tx) => tx.loss > max.loss ? { token: tx.token, loss: tx.loss } : max,
                { token: '', loss: 0 }
              );
              if (maxFumble.loss > biggestFumble.loss) {
                biggestFumble = maxFumble;
              }
            }
          }
        });

        return {
          userId: user.userId,
          displayName: user.nickname || `User_${user.userId.slice(0, 6)}`,
          totalFumbles,
          biggestFumble,
          walletCount: wallets.length,
          rank: 0 // Will be calculated after sorting
        };
      })
    );

    // Sort by total fumbles and assign ranks
    const sortedLeaderboard = leaderboardData
      .sort((a, b) => b.totalFumbles - a.totalFumbles)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }))
      .slice(0, 100); // Only return top 100

    leaderboardCache.set(cacheKey, sortedLeaderboard);
    logger.info('Global leaderboard updated in cache', {
      totalEntries: sortedLeaderboard.length
    });

    return sortedLeaderboard;
  } catch (error) {
    logger.error('Failed to fetch global leaderboard', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw new AppError(500, 'Failed to generate leaderboard');
  }
};

export class LeaderboardService {
  private docClient: DynamoDBDocumentClient;

  constructor() {
    const client = new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(client);
  }

  async updateUserScore(userId: string, score: number) {
    try {
      logger.info('Updating user score', {
        userId,
        score
      });

      // Your existing score update logic...

      leaderboardCache.del('global_leaderboard');
      logger.info('User score updated successfully', {
        userId,
        newScore: score
      });

      return updatedEntry;
    } catch (error) {
      logger.error('Failed to update user score', {
        userId,
        score,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  async getUserRank(userId: string) {
    try {
      logger.info('Fetching user rank', { userId });
      
      // Your existing rank fetch logic...

      logger.info('User rank retrieved', {
        userId,
        rank,
        score
      });

      return { rank, score };
    } catch (error) {
      logger.error('Failed to fetch user rank', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  async refreshLeaderboard() {
    try {
      logger.info('Starting leaderboard refresh');
      
      // Your existing refresh logic...

      leaderboardCache.del('global_leaderboard');
      logger.info('Leaderboard refresh completed', {
        updatedEntries: updatedUsers.length
      });
    } catch (error) {
      logger.error('Failed to refresh leaderboard', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }
} 