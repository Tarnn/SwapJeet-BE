import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';

const CSRF_COOKIE_NAME = 'XSRF-TOKEN';
const CSRF_HEADER_NAME = 'X-XSRF-TOKEN';

export const generateCsrfToken = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Only generate a new token if one doesn't exist in the cookies
    if (!req.cookies[CSRF_COOKIE_NAME]) {
      const csrfToken = randomBytes(32).toString('hex');
      
      // Set the CSRF token cookie
      res.cookie(CSRF_COOKIE_NAME, csrfToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
      });

      // Store token in request for other middleware
      req.csrfToken = csrfToken;
      
      logger.debug('New CSRF token generated', { token: csrfToken });
    } else {
      // Use existing token
      req.csrfToken = req.cookies[CSRF_COOKIE_NAME];
      logger.debug('Using existing CSRF token', { token: req.csrfToken });
    }
    
    next();
  } catch (error) {
    logger.error('Error handling CSRF token', { error });
    next(new AppError(500, 'Error generating security token'));
  }
};

export const validateCsrfToken = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Skip CSRF check for non-mutating methods and health check
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/health') {
      return next();
    }

    const cookieToken = req.cookies[CSRF_COOKIE_NAME];
    const headerToken = req.header(CSRF_HEADER_NAME);

    logger.debug('CSRF Validation', {
      cookieToken,
      headerToken,
      path: req.path,
      method: req.method
    });

    if (!cookieToken || !headerToken) {
      logger.warn('Missing CSRF token', { 
        path: req.path,
        method: req.method,
        ip: req.ip,
        cookieExists: !!cookieToken,
        headerExists: !!headerToken
      });
      throw new AppError(403, 'Invalid security token');
    }

    if (cookieToken !== headerToken) {
      logger.warn('CSRF token mismatch', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        cookieToken,
        headerToken
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