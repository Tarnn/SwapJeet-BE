import winston from 'winston';
import morgan from 'morgan';
import { Request, Response } from 'express';
import path from 'path';

// Extend Request type to include error property
declare module 'express' {
  interface Request {
    error?: Error;
    startTime?: number;
  }
}

// Custom format for better readability
const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}] : ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Winston logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.errors({ stack: true }), // Include stack traces
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
    process.env.NODE_ENV === 'production' 
      ? winston.format.json() 
      : customFormat
  ),
  transports: [
    // Console transport with color
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
      handleExceptions: true
    }),
    // API errors log
    new winston.transports.File({ 
      filename: path.join('logs', 'api-errors.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true,
      zippedArchive: true
    }),
    // API access log
    new winston.transports.File({ 
      filename: path.join('logs', 'api-access.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true,
      zippedArchive: true
    })
  ],
  // Handle uncaught exceptions and unhandled rejections
  handleExceptions: true,
  handleRejections: true,
  exitOnError: false
});

// Skip logging for specific endpoints
const skipRoutes = [
  '/health',
  '/metrics',
  '/favicon.ico'
];

const skipLogging = (req: Request): boolean => {
  return skipRoutes.includes(req.path) || req.path.startsWith('/static/');
};

// Enhanced Morgan tokens for API logging
morgan.token('userId', (req: Request) => req.user?.userId || 'anonymous');
morgan.token('origin', (req: Request) => req.get('origin') || req.get('referer') || '-');
morgan.token('body', (req: Request) => {
  if (req.method === 'GET') return '-';
  const body = { ...req.body };
  // Remove sensitive data
  delete body.password;
  delete body.token;
  delete body.apiKey;
  delete body.secret;
  return JSON.stringify(body);
});
morgan.token('error', (req: Request) => req.error?.message || '-');
morgan.token('response-size', (req: Request, res: Response) => {
  const size = res.getHeader('content-length');
  return size ? `${size}b` : '-';
});

// Create Morgan format based on environment
const morganFormat = process.env.NODE_ENV === 'production'
  ? ':remote-addr - :userId [:date[iso]] ":method :url HTTP/:http-version" :status :response-size - :response-time ms ":origin"'
  : '[:date[iso]] :method :url :status :response-time ms - :body - :error';

// Create Morgan middleware with Winston integration
const morganMiddleware = [
  // Add request start time
  (req: Request, res: Response, next: Function) => {
    req.startTime = Date.now();
    next();
  },
  morgan(morganFormat, {
    stream: {
      write: (message: string) => {
        logger.http(message.trim());
      }
    },
    skip: skipLogging
  })
];

// Utility functions for structured logging
const logInfo = (message: string, meta?: object) => {
  logger.info(message, meta);
};

const logError = (error: Error, meta?: object) => {
  logger.error(error.message, {
    ...meta,
    stack: error.stack,
    name: error.name
  });
};

const logWarning = (message: string, meta?: object) => {
  logger.warn(message, meta);
};

const logDebug = (message: string, meta?: object) => {
  logger.debug(message, meta);
};

// API specific logging helpers
const logAPIError = (error: Error, req: Request, meta?: object) => {
  logError(error, {
    ...meta,
    path: req.path,
    method: req.method,
    userId: req.user?.userId,
    origin: req.get('origin'),
    userAgent: req.get('user-agent'),
    requestId: req.headers['x-request-id']
  });
};

const logAPIRequest = (message: string, req: Request, meta?: object) => {
  logInfo(message, {
    ...meta,
    path: req.path,
    method: req.method,
    userId: req.user?.userId,
    origin: req.get('origin'),
    requestId: req.headers['x-request-id']
  });
};

export { 
  logger, 
  morganMiddleware,
  logInfo,
  logError,
  logWarning,
  logDebug,
  logAPIError,
  logAPIRequest
}; 