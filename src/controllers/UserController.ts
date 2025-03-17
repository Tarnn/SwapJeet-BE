import { Request, Response } from 'express';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { TABLES } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { UserPreferences } from '../models/User';

export class UserController {
  private docClient: DynamoDBDocumentClient;

  constructor(dynamoDb: DynamoDBClient) {
    this.docClient = DynamoDBDocumentClient.from(dynamoDb);
  }

  async updatePreferences(req: Request<{}, {}, UserPreferences>, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new AppError(401, 'User not authenticated');
      }

      const { alerts, showLeaderboard, walletOrder, hideSmall, fumbleTheme, achievements } = req.body;

      // Update user preferences
      await this.docClient.send(new UpdateCommand({
        TableName: TABLES.USERS,
        Key: { userId },
        UpdateExpression: 'SET prefs = :prefs',
        ExpressionAttributeValues: {
          ':prefs': {
            alerts,
            showLeaderboard,
            walletOrder,
            hideSmall,
            fumbleTheme,
            achievements
          }
        },
        ReturnValues: 'ALL_NEW'
      }));

      res.json({
        message: 'Preferences updated successfully',
        preferences: req.body
      });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Error updating preferences:', error);
        res.status(500).json({ error: 'Failed to update preferences' });
      }
    }
  }

  async getPreferences(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        throw new AppError(401, 'User not authenticated');
      }

      // Get user preferences
      const result = await this.docClient.send(new GetCommand({
        TableName: TABLES.USERS,
        Key: { userId }
      }));

      if (!result.Item) {
        throw new AppError(404, 'User not found');
      }

      res.json({ preferences: result.Item.prefs });
    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Error fetching preferences:', error);
        res.status(500).json({ error: 'Failed to fetch preferences' });
      }
    }
  }
} 