import { Request, Response } from 'express';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { UserController } from '../../controllers/UserController';
import { AppError } from '../../middleware/errorHandler';

jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

describe('UserController', () => {
  let userController: UserController;
  let mockDynamoDb: jest.Mocked<DynamoDBClient>;
  let mockDocClient: jest.Mocked<DynamoDBDocumentClient>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockDynamoDb = new DynamoDBClient({}) as jest.Mocked<DynamoDBClient>;
    mockDocClient = {
      send: jest.fn()
    } as unknown as jest.Mocked<DynamoDBDocumentClient>;
    (DynamoDBDocumentClient.from as jest.Mock).mockReturnValue(mockDocClient);

    userController = new UserController(mockDynamoDb);

    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    };
  });

  describe('updatePreferences', () => {
    beforeEach(() => {
      mockReq = {
        user: { userId: 'testUser', email: 'test@example.com' },
        body: {
          alerts: {
            enabled: true,
            threshold: 5,
            email: true,
            push: false
          },
          showLeaderboard: true,
          walletOrder: ['wallet1', 'wallet2'],
          hideSmall: true,
          fumbleTheme: 'dark',
          achievements: {
            showOnProfile: true,
            notifications: true
          }
        }
      };
    });

    it('should update preferences successfully', async () => {
      mockDocClient.send.mockResolvedValueOnce({
        Attributes: mockReq.body
      });

      await userController.updatePreferences(mockReq as Request, mockRes as Response);

      expect(mockDocClient.send).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Preferences updated successfully',
        preferences: mockReq.body
      });
    });

    it('should handle unauthenticated users', async () => {
      mockReq.user = undefined;

      await userController.updatePreferences(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User not authenticated' });
    });

    it('should handle database errors', async () => {
      mockDocClient.send.mockRejectedValueOnce(new Error('Database error'));

      await userController.updatePreferences(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Failed to update preferences' });
    });
  });

  describe('getPreferences', () => {
    beforeEach(() => {
      mockReq = {
        user: { userId: 'testUser', email: 'test@example.com' }
      };
    });

    it('should return user preferences', async () => {
      const mockPreferences = {
        alerts: { enabled: true },
        showLeaderboard: true,
        walletOrder: [],
        hideSmall: false,
        fumbleTheme: 'default',
        achievements: { showOnProfile: true }
      };

      mockDocClient.send.mockResolvedValueOnce({
        Item: { prefs: mockPreferences }
      });

      await userController.getPreferences(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith({ preferences: mockPreferences });
    });

    it('should handle non-existent users', async () => {
      mockDocClient.send.mockResolvedValueOnce({ Item: null });

      await userController.getPreferences(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('should handle unauthenticated users', async () => {
      mockReq.user = undefined;

      await userController.getPreferences(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User not authenticated' });
    });
  });
}); 