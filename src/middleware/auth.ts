import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

export const authenticateJWT = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies?.swapjeet_token;
    
    if (!token) {
      logger.warn('Authentication failed: No token in cookies', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        requestId: req.headers['x-request-id']
      });
      throw new AppError(401, 'Authentication required');
    }

    try {
      const decoded = await verifyToken(token);
      req.user = {
        userId: decoded.userId,
        email: decoded.email
      };

      logger.debug('User authenticated', {
        userId: decoded.userId,
        path: req.path,
        method: req.method,
        requestId: req.headers['x-request-id']
      });

      next();
    } catch (error) {
      logger.warn('Authentication failed: Invalid token', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: req.headers['x-request-id']
      });
      throw new AppError(401, 'Invalid or expired token');
    }
  } catch (error) {
    next(error);
  }
}; 