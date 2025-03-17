import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { errorHandler } from './middleware/errorHandler';
import { generateCsrfToken, validateCsrfToken } from './middleware/csrf';
import { setupRoutes } from './routes';
import { setupWebSocket } from './services/websocket';
import { logger, morganMiddleware } from './config/logger';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingInterval: parseInt(process.env.WS_PING_INTERVAL || '300000'),
  pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '10000')
});

// Load Swagger document
const swaggerDocument = yaml.load(
  fs.readFileSync(path.join(__dirname, 'swagger.yaml'), 'utf8')
) as object;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", '*']
    }
  }
}));

// CORS configuration
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-XSRF-TOKEN']
}));

// Cookie parser middleware
app.use(cookieParser(process.env.COOKIE_SECRET));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Health check endpoint (before CSRF middleware)
app.get('/health', (req, res) => {
  // Generate a new CSRF token
  const csrfToken = randomBytes(32).toString('hex');
  
  // Set the CSRF token cookie
  res.cookie('XSRF-TOKEN', csrfToken, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });

  res.status(200).json({ 
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// CSRF protection
app.use(generateCsrfToken);
app.use(validateCsrfToken);

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'SwapJeet API Documentation',
  customfavIcon: '/favicon.ico'
}));

// Setup routes
setupRoutes(app);

// Setup WebSocket
setupWebSocket(io);

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
  logger.info(`API Documentation available at http://localhost:${PORT}/api-docs`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
});
