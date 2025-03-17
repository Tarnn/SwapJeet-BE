import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';

const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
const CSRF_HEADER_NAME = 'X-XSRF-TOKEN';

export const generateCsrfToken = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Generate a random token
    const csrfToken = randomBytes(32).toString('hex');
    
    // Set the CSRF token cookie
    res.cookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false, // Client needs to read this
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/'
    });

    // Store token in request for other middleware
    req.csrfToken = csrfToken;
    
    next();
  } catch (error) {
    logger.error('Error generating CSRF token', { error });
    next(new AppError(500, 'Error generating security token'));
  }
};

export const validateCsrfToken = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Skip CSRF check for non-mutating methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    const cookieToken = req.cookies[CSRF_COOKIE_NAME];
    const headerToken = req.headers[CSRF_HEADER_NAME.toLowerCase()];

    if (!cookieToken || !headerToken) {
      logger.warn('Missing CSRF token', { 
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      throw new AppError(403, 'Invalid security token');
    }

    if (cookieToken !== headerToken) {
      logger.warn('CSRF token mismatch', {
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      throw new AppError(403, 'Invalid security token');
    }

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else {
      logger.error('CSRF validation error', { error });
      next(new AppError(403, 'Security check failed'));
    }
  }
};

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      csrfToken?: string;
    }
  }
} 