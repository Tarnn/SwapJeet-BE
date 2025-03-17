import { Request, Response } from 'express';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { LeaderboardData, LeaderboardTimeframe, LeaderboardEntry, LeaderboardStats } from '../models/Leaderboard';
import { FumbleTransaction } from '../models/Wallet';
import { TABLES } from '../config/database';
import { leaderboardCache } from '../config/cache';
import { AppError } from '../middleware/errorHandler';

interface FumbleMax {
  token: string;
  loss: number;
}

export class LeaderboardController {
  private docClient: DynamoDBDocumentClient;

  constructor(dynamoDb: DynamoDBClient) {
    this.docClient = DynamoDBDocumentClient.from(dynamoDb);
  }

  async getLeaderboard(req: Request<{}, {}, {}, { timeframe?: LeaderboardTimeframe }>, res: Response) {
    try {
      const { timeframe = 'allTime' } = req.query;

      // Check cache
      const cacheKey = `leaderboard_${timeframe}`;
      const cachedData = leaderboardCache.get<LeaderboardData>(cacheKey);
      if (cachedData) {
        return res.json(cachedData[timeframe]);
      }

      // Get all users who have opted into the leaderboard
      const usersResponse = await this.docClient.send(new ScanCommand({
        TableName: TABLES.USERS,
        FilterExpression: 'prefs.showLeaderboard = :show',
        ExpressionAttributeValues: {
          ':show': true
        }
      }));

      const users = usersResponse.Items || [];

      // Get wallet data for each user
      const leaderboardData = await Promise.all(
        users.map(async (user) => {
          const walletsResponse = await this.docClient.send(new ScanCommand({
            TableName: TABLES.WALLETS,
            FilterExpression: 'userId = :userId',
            ExpressionAttributeValues: {
              ':userId': user.userId
            }
          }));

          const wallets = walletsResponse.Items || [];
          let totalLoss = 0;
          let biggestFumble = { token: '', loss: 0 };

          wallets.forEach(wallet => {
            if (wallet.fumbles) {
              totalLoss += wallet.fumbles.totalLoss;
              if (wallet.fumbles.transactions) {
                const maxFumble = wallet.fumbles.transactions.reduce(
                  (max: FumbleMax, tx: FumbleTransaction): FumbleMax => 
                    tx.loss > max.loss ? { token: tx.token, loss: tx.loss } : max,
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
            address: wallets[0]?.address || '',
            nickname: user.nickname,
            totalLoss,
            jeetScore: this.calculateJeetScore(totalLoss, wallets),
            rank: 0, // Will be calculated after sorting
            transactions: wallets.flatMap(w => w.fumbles?.transactions || [])
          };
        })
      );

      // Sort and assign ranks
      const sortedEntries = leaderboardData
        .sort((a, b) => b.totalLoss - a.totalLoss)
        .map((entry, index) => ({
          ...entry,
          rank: index + 1
        }))
        .slice(0, 100); // Only return top 100

      const stats = this.calculateStats(sortedEntries);

      const result = {
        start: this.getTimeframeStart(timeframe),
        end: new Date().toISOString(),
        entries: sortedEntries,
        stats
      };

      // Cache the result
      const allTimeframeData = {
        daily: result,
        weekly: result,
        monthly: result,
        allTime: result
      };
      leaderboardCache.set(cacheKey, allTimeframeData);

      res.json(result);
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
      }
    }
  }

  async getUserRank(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new AppError(401, 'User not authenticated');
      }

      const timeframes: LeaderboardTimeframe[] = ['daily', 'weekly', 'monthly', 'allTime'];
      const ranks = await Promise.all(
        timeframes.map(async (timeframe) => {
          const cacheKey = `leaderboard_${timeframe}`;
          const cachedData = leaderboardCache.get<LeaderboardData>(cacheKey);
          
          if (cachedData) {
            const entry = cachedData[timeframe].entries.find(e => e.userId === userId);
            return { timeframe, rank: entry?.rank || 0 };
          }

          return { timeframe, rank: 0 };
        })
      );

      const result = ranks.reduce((acc, { timeframe, rank }) => ({
        ...acc,
        [timeframe]: rank
      }), {} as Record<LeaderboardTimeframe, number>);

      res.json({ ranks: result });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Error fetching user rank:', error);
        res.status(500).json({ error: 'Failed to fetch user rank' });
      }
    }
  }

  async getLeaderboardStats(req: Request<{}, {}, {}, { timeframe?: LeaderboardTimeframe }>, res: Response) {
    try {
      const { timeframe = 'allTime' } = req.query;

      // Check cache
      const cacheKey = `leaderboard_${timeframe}`;
      const cachedData = leaderboardCache.get<LeaderboardData>(cacheKey);
      if (cachedData) {
        return res.json({ stats: cachedData[timeframe].stats });
      }

      // If not in cache, trigger a full leaderboard refresh
      await this.getLeaderboard(req, res);
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Error fetching leaderboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch leaderboard stats' });
      }
    }
  }

  private calculateJeetScore(totalLoss: number, wallets: any[]): number {
    const totalValue = wallets.reduce((sum, wallet) => {
      return sum + (wallet.netWorthHistory?.[0]?.value || 0);
    }, 0);

    return totalValue > 0 ? Math.round((totalLoss / totalValue) * 100) : 0;
  }

  private calculateStats(entries: LeaderboardEntry[]): LeaderboardStats {
    const totalUsers = entries.length;
    const totalLoss = entries.reduce((sum, entry) => sum + entry.totalLoss, 0);
    const averageLoss = totalUsers > 0 ? totalLoss / totalUsers : 0;
    const topFumbler = entries[0] || null;

    return {
      totalUsers,
      totalLoss,
      averageLoss,
      topFumbler: topFumbler ? {
        address: topFumbler.address,
        nickname: topFumbler.nickname,
        loss: topFumbler.totalLoss
      } : {
        address: '',
        loss: 0
      }
    };
  }

  private getTimeframeStart(timeframe: LeaderboardTimeframe): string {
    const now = new Date();
    switch (timeframe) {
      case 'daily':
        return new Date(now.setDate(now.getDate() - 1)).toISOString();
      case 'weekly':
        return new Date(now.setDate(now.getDate() - 7)).toISOString();
      case 'monthly':
        return new Date(now.setMonth(now.getMonth() - 1)).toISOString();
      default:
        return new Date(0).toISOString(); // Beginning of time for allTime
    }
  }
} 