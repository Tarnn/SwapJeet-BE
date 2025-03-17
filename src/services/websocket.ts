import { Server, Socket } from 'socket.io';
import { verifyToken } from '../utils/auth';
import { logger } from '../utils/logger';
import NodeCache from 'node-cache';

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

const walletUpdateCache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL || '900'), // 15 minutes
  checkperiod: 120 // Check for expired keys every 2 minutes
});

export const setupWebSocket = (io: Server) => {
  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        throw new Error('Authentication token is required');
      }

      const decoded = await verifyToken(token);
      socket.userId = decoded.userId;
      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    logger.info(`Client connected: ${socket.id}`);

    // Join user-specific room
    if (socket.userId) {
      socket.join(`user_${socket.userId}`);
    }

    // Handle wallet subscription
    socket.on('subscribe_wallet', (address: string) => {
      if (!socket.userId) return;
      
      const room = `wallet_${address.toLowerCase()}`;
      socket.join(room);
      logger.info(`Client ${socket.id} subscribed to wallet ${address}`);

      // Send cached update if available
      const cachedUpdate = walletUpdateCache.get(address.toLowerCase());
      if (cachedUpdate) {
        socket.emit('wallet_update', cachedUpdate);
      }
    });

    // Handle wallet unsubscription
    socket.on('unsubscribe_wallet', (address: string) => {
      if (!socket.userId) return;
      
      const room = `wallet_${address.toLowerCase()}`;
      socket.leave(room);
      logger.info(`Client ${socket.id} unsubscribed from wallet ${address}`);
    });

    socket.on('disconnect', () => {
      logger.info(`Client disconnected: ${socket.id}`);
    });
  });

  // Function to broadcast wallet updates
  const broadcastWalletUpdate = (address: string, data: any) => {
    const room = `wallet_${address.toLowerCase()}`;
    walletUpdateCache.set(address.toLowerCase(), data);
    io.to(room).emit('wallet_update', data);
  };

  return {
    broadcastWalletUpdate
  };
}; 