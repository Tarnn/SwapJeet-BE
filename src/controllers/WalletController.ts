import { Request, Response } from 'express';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import axios from 'axios';
import { createCanvas, loadImage } from 'canvas';
import { validateAddress } from '../utils/validation';
import { AddWalletInput, UpdateWalletInput, Wallet, WalletDetails, FumbleResult } from '../models/Wallet';
import { TABLES, S3_BUCKET } from '../config/database';
import { walletDetailsCache, walletUpdatesCache } from '../config/cache';
import { AppError } from '../middleware/errorHandler';
import { calculateFumbles } from '../services/fumbleCalculator';
import { logger, logAPIRequest, logAPIError } from '../config/logger';

export class WalletController {
  private docClient: DynamoDBDocumentClient;

  constructor() {
    const client = new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(client);
  }

  async addWallet(req: Request<{}, {}, AddWalletInput>, res: Response) {
    try {
      const { address, nickname, tag } = req.body;
      const userId = req.user?.userId;

      logAPIRequest('Adding new wallet', req, {
        address,
        nickname,
        tag
      });

      if (!userId) {
        throw new AppError(401, 'User not authenticated');
      }

      if (!validateAddress(address)) {
        throw new AppError(400, 'Invalid Ethereum address');
      }

      // Check if wallet exists on Zapper
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

      // Check if wallet already exists for user
      const existingWallet = await this.docClient.send(new GetCommand({
        TableName: TABLES.WALLETS,
        Key: {
          userId,
          address: address.toLowerCase()
        }
      }));

      if (existingWallet.Item) {
        throw new AppError(409, 'Wallet already exists for user');
      }

      // Create wallet record
      const wallet: Wallet = {
        userId,
        address: address.toLowerCase(),
        nickname,
        tag,
        addedAt: new Date().toISOString(),
        isPinned: false,
        netWorthHistory: [{
          timestamp: new Date().toISOString(),
          value: zapperResponse.data[address].total
        }]
      };

      await this.docClient.send(new PutCommand({
        TableName: TABLES.WALLETS,
        Item: wallet
      }));

      // Cache initial wallet details
      const details: WalletDetails = {
        address: address.toLowerCase(),
        tokens: zapperResponse.data[address].tokens,
        netWorth: zapperResponse.data[address].total,
        topGainer: this.calculateTopChange(zapperResponse.data[address].tokens, true),
        topLoser: this.calculateTopChange(zapperResponse.data[address].tokens, false)
      };

      walletDetailsCache.set(`wallet_${address.toLowerCase()}`, details);

      logger.info('Wallet added successfully', {
        userId,
        address,
        requestId: req.headers['x-request-id']
      });

      res.status(201).json(wallet);
    } catch (error) {
      logAPIError(error as Error, req);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Error adding wallet:', error);
        res.status(500).json({ error: 'Failed to add wallet' });
      }
    }
  }

  async updateWallet(req: Request<{ address: string }, {}, UpdateWalletInput>, res: Response) {
    try {
      const { address } = req.params;
      const updates = req.body;
      const userId = req.user?.userId;

      logAPIRequest('Updating wallet', req, {
        address,
        updates
      });

      if (!userId) {
        throw new AppError(401, 'User not authenticated');
      }

      // Verify wallet belongs to user
      const existingWallet = await this.docClient.send(new GetCommand({
        TableName: TABLES.WALLETS,
        Key: {
          userId,
          address: address.toLowerCase()
        }
      }));

      if (!existingWallet.Item) {
        throw new AppError(404, 'Wallet not found');
      }

      // Update wallet
      const updatedWallet: Wallet = {
        ...existingWallet.Item as Wallet,
        ...updates,
        address: address.toLowerCase() // Ensure address stays lowercase
      };

      await this.docClient.send(new PutCommand({
        TableName: TABLES.WALLETS,
        Item: updatedWallet
      }));

      logger.info('Wallet updated successfully', {
        userId,
        address,
        updates,
        requestId: req.headers['x-request-id']
      });

      res.json(updatedWallet);
    } catch (error) {
      logAPIError(error as Error, req);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Error updating wallet:', error);
        res.status(500).json({ error: 'Failed to update wallet' });
      }
    }
  }

  async deleteWallet(req: Request<{ address: string }>, res: Response) {
    try {
      const { address } = req.params;
      const userId = req.user?.userId;

      logAPIRequest('Deleting wallet', req, { address });

      if (!userId) {
        throw new AppError(401, 'User not authenticated');
      }

      // Delete wallet
      await this.docClient.send(new DeleteCommand({
        TableName: TABLES.WALLETS,
        Key: {
          userId,
          address: address.toLowerCase()
        }
      }));

      // Clear caches
      walletDetailsCache.del(`wallet_${address.toLowerCase()}`);
      walletUpdatesCache.del(`updates_${address.toLowerCase()}`);

      logger.info('Wallet deleted successfully', {
        userId,
        address,
        requestId: req.headers['x-request-id']
      });

      res.status(204).send();
    } catch (error) {
      logAPIError(error as Error, req);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Error deleting wallet:', error);
        res.status(500).json({ error: 'Failed to delete wallet' });
      }
    }
  }

  async getWallets(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        throw new AppError(401, 'User not authenticated');
      }

      // Query user's wallets
      const result = await this.docClient.send(new QueryCommand({
        TableName: TABLES.WALLETS,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId
        }
      }));

      const wallets = result.Items as Wallet[];

      // Fetch cached details for each wallet
      const walletsWithDetails = await Promise.all(
        wallets.map(async (wallet) => {
          const details = walletDetailsCache.get<WalletDetails>(`wallet_${wallet.address}`);
          return {
            ...wallet,
            details: details || null
          };
        })
      );

      res.json({ wallets: walletsWithDetails });
    } catch (error) {
      logAPIError(error as Error, req);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Error fetching wallets:', error);
        res.status(500).json({ error: 'Failed to fetch wallets' });
      }
    }
  }

  async getWalletDetails(req: Request<{ address: string }>, res: Response) {
    try {
      const { address } = req.params;
      const normalizedAddress = address.toLowerCase();

      // Check cache
      const cachedDetails = walletDetailsCache.get<WalletDetails>(`wallet_${normalizedAddress}`);
      if (cachedDetails) {
        return res.json(cachedDetails);
      }

      // Fetch from Zapper
      const zapperResponse = await axios.get(
        `https://api.zapper.fi/v1/balances/tokens?addresses[]=${normalizedAddress}`,
        {
          headers: {
            'Authorization': `Basic ${process.env.ZAPPER_API_KEY}`
          }
        }
      );

      if (!zapperResponse.data || !zapperResponse.data[normalizedAddress]) {
        throw new AppError(404, 'Wallet not found or empty');
      }

      const details: WalletDetails = {
        address: normalizedAddress,
        tokens: zapperResponse.data[normalizedAddress].tokens,
        netWorth: zapperResponse.data[normalizedAddress].total,
        topGainer: this.calculateTopChange(zapperResponse.data[normalizedAddress].tokens, true),
        topLoser: this.calculateTopChange(zapperResponse.data[normalizedAddress].tokens, false)
      };

      // Cache details
      walletDetailsCache.set(`wallet_${normalizedAddress}`, details);

      logger.info('Wallet details retrieved', {
        userId: req.user?.userId,
        address,
        requestId: req.headers['x-request-id']
      });

      res.json(details);
    } catch (error) {
      logAPIError(error as Error, req);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Error fetching wallet details:', error);
        res.status(500).json({ error: 'Failed to fetch wallet details' });
      }
    }
  }

  async getFumbles(req: Request<{ address: string }>, res: Response) {
    try {
      const { address } = req.params;
      const normalizedAddress = address.toLowerCase();

      // Check cache
      const cachedFumbles = walletDetailsCache.get<FumbleResult>(`fumbles_${normalizedAddress}`);
      if (cachedFumbles) {
        return res.json(cachedFumbles);
      }

      // Calculate fumbles
      const fumbles = await calculateFumbles(normalizedAddress);

      // Cache results
      walletDetailsCache.set(`fumbles_${normalizedAddress}`, fumbles);

      res.json(fumbles);
    } catch (error) {
      logAPIError(error as Error, req);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Error fetching fumbles:', error);
        res.status(500).json({ error: 'Failed to fetch fumbles' });
      }
    }
  }

  async exportFumblesPNG(req: Request<{ address: string }>, res: Response) {
    try {
      const { address } = req.params;
      const userId = req.user?.userId;

      logAPIRequest('Exporting fumbles as PNG', req, { address });

      if (!userId) {
        throw new AppError(401, 'User not authenticated');
      }

      // Get fumble data
      const fumbles = await calculateFumbles(address.toLowerCase());
      
      // Create canvas
      const canvas = createCanvas(1200, 630);
      const ctx = canvas.getContext('2d');

      // Set background
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, 1200, 630);

      // Add SwapJeet watermark
      ctx.fillStyle = '#333333';
      ctx.font = 'bold 24px Arial';
      ctx.fillText('SwapJeet.com', 1000, 590);

      // Draw fumble stats
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 48px Arial';
      ctx.fillText(`Jeet Score: ${fumbles.jeetScore}`, 50, 100);

      ctx.font = 'bold 36px Arial';
      ctx.fillText(`Total Loss: $${fumbles.totalLoss.toLocaleString()}`, 50, 160);

      // Draw top 5 fumbles
      ctx.font = 'bold 32px Arial';
      ctx.fillText('Top Fumbles:', 50, 240);

      const top5Fumbles = fumbles.transactions
        .sort((a, b) => b.loss - a.loss)
        .slice(0, 5);

      top5Fumbles.forEach((fumble, index) => {
        ctx.font = '28px Arial';
        const y = 300 + (index * 60);
        ctx.fillText(
          `${index + 1}. ${fumble.token}: $${fumble.loss.toLocaleString()} (${fumble.type})`,
          70,
          y
        );
      });

      // Convert canvas to buffer
      const buffer = canvas.toBuffer('image/png');

      // Upload to S3
      const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
      const key = `fumbles/${userId}/${address}/${Date.now()}.png`;

      await s3Client.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: 'image/png'
      }));

      // Generate presigned URL (7 days expiry)
      const presignedUrl = await getSignedUrl(
        s3Client,
        new PutObjectCommand({ Bucket: S3_BUCKET, Key: key }),
        { expiresIn: 7 * 24 * 60 * 60 }
      );

      logger.info('Fumbles exported successfully', {
        userId,
        address,
        requestId: req.headers['x-request-id'],
        s3Key: key
      });

      res.json({ url: presignedUrl });
    } catch (error) {
      logAPIError(error as Error, req);
      if (error instanceof AppError) {
        res.status(error.statusCode).json({ error: error.message });
      } else {
        console.error('Error exporting fumbles PNG:', error);
        res.status(500).json({ error: 'Failed to export fumbles PNG' });
      }
    }
  }

  private calculateTopChange(tokens: any[], isGainer: boolean): { symbol: string; change24h: number } {
    if (!tokens.length) {
      return { symbol: '', change24h: 0 };
    }

    const sorted = [...tokens].sort((a, b) => 
      isGainer ? b.change24h - a.change24h : a.change24h - b.change24h
    );

    return {
      symbol: sorted[0].symbol,
      // TODO: Implement get fumbles logic
      // 1. Query transaction history
      // 2. Analyze for fumble patterns
      // 3. Calculate losses and rankings
      
      res.json({ fumbles: { transactions: [], totalLoss: 0 } });
    } catch (error) {
      console.error('Error fetching fumbles:', error);
      res.status(500).json({ error: 'Failed to fetch fumbles' });
    }
  }
} 