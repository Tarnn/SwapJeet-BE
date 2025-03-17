import { Server, Socket } from 'socket.io';
import { verifyToken } from '../utils/auth';
import { logger } from '../config/logger';
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
    const clientId = socket.id;
    logger.info('WebSocket client connected', {
      clientId,
      transport: socket.conn.transport.name,
      address: socket.handshake.address,
      userAgent: socket.handshake.headers['user-agent']
    });

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

    socket.on('disconnect', (reason) => {
      logger.info('WebSocket client disconnected', {
        clientId,
        reason
      });
    });

    socket.on('error', (error) => {
      logger.error('WebSocket error', {
        clientId,
        error: error.message,
        stack: error.stack
      });
    });
  });

  // Function to broadcast wallet updates
  const broadcastWalletUpdate = (address: string, data: any) => {
    const room = `wallet_${address.toLowerCase()}`;
    walletUpdateCache.set(address.toLowerCase(), data);
    io.to(room).emit('wallet_update', data);
  };

  // Log server events
  io.engine.on('connection_error', (err) => {
    logger.error('WebSocket connection error', {
      error: err.message,
      code: err.code,
      context: err.context
    });
  });

  return {
    broadcastWalletUpdate
  };
}; 