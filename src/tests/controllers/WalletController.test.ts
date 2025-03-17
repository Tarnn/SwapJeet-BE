import { Request, Response } from 'express';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { WalletController } from '../../controllers/WalletController';
import { walletDetailsCache } from '../../config/cache';
import { AppError } from '../../middleware/errorHandler';
import axios from 'axios';

jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');
jest.mock('axios');
jest.mock('../../config/cache');

describe('WalletController', () => {
  let walletController: WalletController;
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

    walletController = new WalletController(mockDynamoDb);

    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn()
    };
  });

  describe('addWallet', () => {
    beforeEach(() => {
      mockReq = {
        user: { userId: 'testUser', email: 'test@example.com' },
        body: {
          address: '0x1234567890123456789012345678901234567890',
          nickname: 'Test Wallet',
          tag: 'Me'
        }
      };
    });

    it('should add a wallet successfully', async () => {
      const zapperResponse = {
        data: {
          '0x1234567890123456789012345678901234567890': {
            total: 1000,
            tokens: []
          }
        }
      };
      (axios.get as jest.Mock).mockResolvedValue(zapperResponse);
      mockDocClient.send.mockResolvedValueOnce({ Item: null }); // No existing wallet
      mockDocClient.send.mockResolvedValueOnce({}); // Successful put

      await walletController.addWallet(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalled();
      expect(walletDetailsCache.set).toHaveBeenCalled();
    });

    it('should reject invalid addresses', async () => {
      mockReq.body.address = 'invalid';
      
      await walletController.addWallet(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid Ethereum address' });
    });

    it('should handle duplicate wallets', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: { '0x1234567890123456789012345678901234567890': { total: 1000, tokens: [] } }
      });
      mockDocClient.send.mockResolvedValueOnce({ Item: { address: mockReq.body.address } });

      await walletController.addWallet(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Wallet already exists for user' });
    });
  });

  describe('getWalletDetails', () => {
    beforeEach(() => {
      mockReq = {
        params: { address: '0x1234567890123456789012345678901234567890' }
      };
    });

    it('should return cached details if available', async () => {
      const cachedDetails = {
        address: mockReq.params.address,
        tokens: [],
        netWorth: 1000
      };
      (walletDetailsCache.get as jest.Mock).mockReturnValue(cachedDetails);

      await walletController.getWalletDetails(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith(cachedDetails);
      expect(axios.get).not.toHaveBeenCalled();
    });

    it('should fetch and cache details if not cached', async () => {
      (walletDetailsCache.get as jest.Mock).mockReturnValue(null);
      const zapperResponse = {
        data: {
          [mockReq.params.address]: {
            total: 1000,
            tokens: []
          }
        }
      };
      (axios.get as jest.Mock).mockResolvedValue(zapperResponse);

      await walletController.getWalletDetails(mockReq as Request, mockRes as Response);

      expect(walletDetailsCache.set).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalled();
    });

    it('should handle non-existent wallets', async () => {
      (walletDetailsCache.get as jest.Mock).mockReturnValue(null);
      (axios.get as jest.Mock).mockResolvedValue({ data: {} });

      await walletController.getWalletDetails(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Wallet not found or empty' });
    });
  });

  describe('exportFumblesPNG', () => {
    beforeEach(() => {
      mockReq = {
        user: { userId: 'testUser', email: 'test@example.com' },
        params: { address: '0x1234567890123456789012345678901234567890' }
      };
    });

    it('should generate and upload PNG successfully', async () => {
      const fumbles = {
        transactions: [
          { token: 'TEST', loss: 1000, type: 'Early' }
        ],
        totalLoss: 1000,
        jeetScore: 50
      };
      jest.mock('../../services/fumbleCalculator', () => ({
        calculateFumbles: jest.fn().mockResolvedValue(fumbles)
      }));

      await walletController.exportFumblesPNG(mockReq as Request, mockRes as Response);

      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        url: expect.any(String)
      }));
    });

    it('should handle unauthenticated users', async () => {
      mockReq.user = undefined;

      await walletController.exportFumblesPNG(mockReq as Request, mockRes as Response);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User not authenticated' });
    });
  });
}); 