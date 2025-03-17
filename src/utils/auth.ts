import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

interface TokenPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

interface GooglePayload {
  email: string;
  sub: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

export const verifyGoogleToken = async (token: string): Promise<GooglePayload> => {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    
    if (!payload || !payload.email || !payload.sub) {
      logger.warn('Invalid Google token payload', { email: payload?.email });
      throw new AppError(401, 'Invalid token payload');
    }

    // Ensure email is verified
    if (!payload.email_verified) {
      logger.warn('Unverified Google email attempt', { email: payload.email });
      throw new AppError(401, 'Email not verified');
    }

    return {
      email: payload.email,
      sub: payload.sub,
      name: payload.name,
      picture: payload.picture,
      email_verified: payload.email_verified
    };
  } catch (error) {
    logger.error('Google token verification failed', { error });
    throw new AppError(401, 'Invalid Google token');
  }
};

export const generateToken = (payload: TokenPayload): string => {
  try {
    // Add additional claims for security
    const tokenPayload = {
      ...payload,
      iss: 'swapjeet-api',
      aud: 'swapjeet-client',
      type: 'access'
    };

    return jwt.sign(tokenPayload, process.env.JWT_SECRET!, {
      expiresIn: process.env.JWT_EXPIRY || '24h',
      algorithm: 'HS512' // Using a stronger algorithm
    });
  } catch (error) {
    logger.error('Token generation failed', { error, userId: payload.userId });
    throw new AppError(500, 'Error generating token');
  }
};

export const verifyToken = async (token: string): Promise<TokenPayload> => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!, {
      algorithms: ['HS512'],
      issuer: 'swapjeet-api',
      audience: 'swapjeet-client'
    }) as TokenPayload;

    // Check token expiration explicitly
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      throw new AppError(401, 'Token has expired');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(401, 'Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AppError(401, 'Invalid token');
    }
    throw new AppError(401, 'Token verification failed');
  }
};

export const extractTokenFromHeader = (authHeader: string | undefined): string => {
  if (!authHeader) {
    throw new AppError(401, 'No authorization header');
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new AppError(401, 'Invalid authorization header format');
  }

  const token = parts[1];
  if (!token || token.length < 10) { // Basic length validation
    throw new AppError(401, 'Invalid token format');
  }

  return token;
};

// Rate limiting for token verification
const tokenVerificationAttempts = new Map<string, { count: number; timestamp: number }>();

export const checkTokenVerificationRate = (userId: string): void => {
  const now = Date.now();
  const attempt = tokenVerificationAttempts.get(userId);

  if (attempt) {
    // Reset if last attempt was more than 15 minutes ago
    if (now - attempt.timestamp > 15 * 60 * 1000) {
      tokenVerificationAttempts.set(userId, { count: 1, timestamp: now });
      return;
    }

    // Check rate limit
    if (attempt.count >= 10) {
      logger.warn('Token verification rate limit exceeded', { userId });
      throw new AppError(429, 'Too many token verification attempts');
    }

    // Increment counter
    attempt.count += 1;
    attempt.timestamp = now;
    tokenVerificationAttempts.set(userId, attempt);
  } else {
    tokenVerificationAttempts.set(userId, { count: 1, timestamp: now });
  }
}; 