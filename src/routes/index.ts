import { Express } from 'express';
import authRoutes from './auth.routes';
import walletRoutes from './wallet.routes';
import leaderboardRoutes from './leaderboard.routes';
import { authenticateJWT } from '../middleware/auth';

export const setupRoutes = (app: Express) => {
  // Public routes
  app.use('/api/auth', authRoutes);

  // Protected routes
  app.use('/api/wallets', authenticateJWT, walletRoutes);
  app.use('/api/leaderboard', authenticateJWT, leaderboardRoutes);
}; 