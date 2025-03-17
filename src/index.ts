import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { errorHandler } from './middleware/errorHandler';
import { setupRoutes } from './routes';
import { setupWebSocket } from './services/websocket';
import { logger, morganMiddleware } from './config/logger';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingInterval: parseInt(process.env.WS_PING_INTERVAL || '300000'),
  pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '10000')
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
});
app.use(limiter);

// Request ID middleware
app.use((req, res, next) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || 
    Math.random().toString(36).substring(2, 15);
  next();
});

// Enhanced logging setup
app.use(...morganMiddleware);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup routes
setupRoutes(app);

// Setup WebSocket
setupWebSocket(io);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

// Graceful shutdown handling
const gracefulShutdown = () => {
  logger.info('Received shutdown signal. Closing HTTP server...');
  httpServer.close(() => {
    logger.info('HTTP server closed.');
    process.exit(0);
  });

  // Force close after 10s
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

httpServer.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
});
