import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { AppError } from '../middleware/errorHandler';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

interface TokenPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export const verifyGoogleToken = async (token: string): Promise<{ email: string; sub: string }> => {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    
    if (!payload || !payload.email || !payload.sub) {
      throw new AppError(401, 'Invalid token payload');
    }

    return {
      email: payload.email,
      sub: payload.sub
    };
  } catch (error) {
    throw new AppError(401, 'Invalid Google token');
  }
};

export const generateToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRY || '24h'
  });
};

export const verifyToken = async (token: string): Promise<TokenPayload> => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    return decoded;
  } catch (error) {
    throw new AppError(401, 'Invalid or expired token');
  }
};

export const extractTokenFromHeader = (authHeader: string | undefined): string => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(401, 'No token provided');
  }

  return authHeader.split(' ')[1];
}; 