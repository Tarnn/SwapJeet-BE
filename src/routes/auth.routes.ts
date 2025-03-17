import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyGoogleToken, generateToken } from '../utils/auth';
import { createUser, findUserByEmail } from '../services/user.service';
import { loginWithPassword, setPassword, generatePasswordResetToken, resetPassword } from '../services/auth.service';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';
import { validatePassword } from '../utils/validation';

const router = Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per IP
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Google OAuth authentication
router.post('/google', authLimiter, async (req, res, next) => {
  const requestId = req.headers['x-request-id'];
  
  try {
    const { token } = req.body;
    const clientIp = req.ip;

    if (!token) {
      logger.warn('Google auth attempt without token', { requestId, clientIp });
      throw new AppError(400, 'Token is required');
    }

    // Verify Google token and get user info
    const googleUser = await verifyGoogleToken(token);
    logger.info('Google token verified successfully', { 
      requestId, 
      email: googleUser.email,
      googleId: googleUser.sub 
    });
    
    // Find or create user
    let user = await findUserByEmail(googleUser.email);
    
    if (!user) {
      user = await createUser({
        email: googleUser.email,
        googleId: googleUser.sub,
        name: googleUser.name,
        picture: googleUser.picture,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      });
      logger.info('New user created via Google OAuth', { 
        requestId, 
        userId: user.userId,
        email: user.email 
      });
    } else {
      // Update last login time
      user.lastLogin = new Date().toISOString();
      logger.info('Existing user logged in via Google OAuth', { 
        requestId, 
        userId: user.userId,
        email: user.email 
      });
    }

    // Generate JWT with enhanced security
    const authToken = generateToken({
      userId: user.userId,
      email: user.email
    });

    // Set secure cookie with JWT
    res.cookie('auth_token', authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    res.status(200).json({
      token: authToken, // Also send in response for client-side storage if needed
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        picture: user.picture,
        nickname: user.nickname
      }
    });
  } catch (error) {
    logger.error('Authentication error', { 
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(error);
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  // Clear auth cookie
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });

  res.status(200).json({ message: 'Logged out successfully' });
});

// Token refresh endpoint
router.post('/refresh', authLimiter, async (req, res, next) => {
  const requestId = req.headers['x-request-id'];
  
  try {
    const oldToken = req.cookies.auth_token;
    if (!oldToken) {
      throw new AppError(401, 'No refresh token provided');
    }

    // Verify existing token
    const decoded = await verifyToken(oldToken);
    
    // Generate new token
    const newToken = generateToken({
      userId: decoded.userId,
      email: decoded.email
    });

    // Set new secure cookie
    res.cookie('auth_token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.status(200).json({ token: newToken });
  } catch (error) {
    logger.error('Token refresh error', { 
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(error);
  }
});

export default router; 