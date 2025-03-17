import request from 'supertest';
import { Express } from 'express';
import { createServer } from '../../server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { mockDeep } from 'jest-mock-extended';

describe('API Integration Tests', () => {
  let app: Express;
  let mockDynamoDb: jest.Mocked<DynamoDBClient>;

  beforeAll(async () => {
    mockDynamoDb = mockDeep<DynamoDBClient>();
    app = await createServer(mockDynamoDb);
  });

  describe('Authentication', () => {
    it('should reject requests without authentication', async () => {
      const response = await request(app).get('/api/wallets');
      expect(response.status).toBe(401);
    });

    it('should reject invalid tokens', async () => {
      const response = await request(app)
        .get('/api/wallets')
        .set('Cookie', ['swapjeet_token=invalid_token']);
      expect(response.status).toBe(401);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const requests = Array(11).fill(null).map(() =>
        request(app).get('/api/wallets')
      );
      const responses = await Promise.all(requests);
      const tooManyRequests = responses.some(r => r.status === 429);
      expect(tooManyRequests).toBe(true);
    });
  });

  describe('Wallet Management', () => {
    const validToken = 'valid_token'; // Mock JWT token
    const validAddress = '0x1234567890123456789012345678901234567890';

    beforeEach(() => {
      // Mock JWT verification
      jest.spyOn(require('jsonwebtoken'), 'verify')
        .mockImplementation(() => ({ userId: 'testUser', email: 'test@example.com' }));
    });

    it('should add a wallet successfully', async () => {
      const response = await request(app)
        .post('/api/wallets')
        .set('Cookie', [`swapjeet_token=${validToken}`])
        .send({
          address: validAddress,
          nickname: 'Test Wallet',
          tag: 'Me'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('address', validAddress);
    });

    it('should handle concurrent wallet operations', async () => {
      const operations = [
        request(app)
          .post('/api/wallets')
          .set('Cookie', [`swapjeet_token=${validToken}`])
          .send({ address: validAddress }),
        request(app)
          .get(`/api/wallets/${validAddress}`)
          .set('Cookie', [`swapjeet_token=${validToken}`]),
        request(app)
          .delete(`/api/wallets/${validAddress}`)
          .set('Cookie', [`swapjeet_token=${validToken}`])
      ];

      const responses = await Promise.all(operations);
      responses.forEach(response => {
        expect(response.status).toBeLessThan(500);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      mockDynamoDb.send.mockRejectedValueOnce(new Error('Connection failed'));

      const response = await request(app)
        .get('/api/wallets')
        .set('Cookie', ['swapjeet_token=valid_token']);

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('error', 'Service temporarily unavailable');
    });

    it('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .post('/api/wallets')
        .set('Cookie', ['swapjeet_token=valid_token'])
        .set('Content-Type', 'application/json')
        .send('{"malformed:json}');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Cache Behavior', () => {
    it('should return cached wallet details when available', async () => {
      const firstResponse = await request(app)
        .get(`/api/wallets/${validAddress}`)
        .set('Cookie', ['swapjeet_token=valid_token']);

      const secondResponse = await request(app)
        .get(`/api/wallets/${validAddress}`)
        .set('Cookie', ['swapjeet_token=valid_token']);

      expect(firstResponse.body).toEqual(secondResponse.body);
      expect(mockDynamoDb.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('Leaderboard Integration', () => {
    it('should respect user privacy settings', async () => {
      // Set user preference to hide from leaderboard
      await request(app)
        .patch('/api/preferences')
        .set('Cookie', ['swapjeet_token=valid_token'])
        .send({ showLeaderboard: false });

      const response = await request(app)
        .get('/api/leaderboard')
        .set('Cookie', ['swapjeet_token=valid_token']);

      const userInLeaderboard = response.body.entries.some(
        (entry: any) => entry.userId === 'testUser'
      );
      expect(userInLeaderboard).toBe(false);
    });
  });
}); 