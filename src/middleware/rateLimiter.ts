import rateLimit from 'express-rate-limit';
import { logger } from '../config/logger';

// Rate limit configurations
const rateLimitConfigs = {
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: 'Too many authentication attempts, please try again later'
  },
  api: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // 100 requests per window
  },
  wallet: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30 // 30 requests per window
  },
  leaderboard: {
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10 // 10 requests per window
  }
};

// Create rate limiters with logging
export const createRateLimiter = (type: keyof typeof rateLimitConfigs) => {
  const config = rateLimitConfigs[type];
  
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: config.message || 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        type,
        ip: req.ip,
        path: req.path,
        requestId: req.headers['x-request-id']
      });
      res.status(429).json({
        error: 'Too Many Requests',
        message: config.message || 'Too many requests, please try again later',
        retryAfter: Math.ceil(config.windowMs / 1000)
      });
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/health';
    }
  });
};

// Export configured limiters
export const authLimiter = createRateLimiter('auth');
export const apiLimiter = createRateLimiter('api');
export const walletLimiter = createRateLimiter('wallet');
export const leaderboardLimiter = createRateLimiter('leaderboard'); 