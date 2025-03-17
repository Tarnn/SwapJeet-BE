import { Router } from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import { apiLimiter } from '../middleware/rateLimiter';
import { findUserById, updateUser } from '../services/user.service';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../config/logger';
import { validateUserUpdate } from '../utils/validation';
import { UpdateUserDto } from '../interfaces/user.interface';

const router = Router();

// Get user profile
router.get('/profile', authMiddleware, apiLimiter, async (req, res, next) => {
  const requestId = req.headers['x-request-id'];
  try {
    const user = await findUserById(req.user!.userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }

    // Remove sensitive information
    const { googleId, ...safeUser } = user;
    
    res.json(safeUser);
  } catch (error) {
    logger.error('Error fetching user profile', { 
      requestId,
      userId: req.user?.userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(error);
  }
});

// Update user profile
router.put('/profile', authMiddleware, apiLimiter, async (req, res, next) => {
  const requestId = req.headers['x-request-id'];
  try {
    const updates: UpdateUserDto = req.body;
    
    // Validate updates
    const validationError = validateUserUpdate(updates);
    if (validationError) {
      throw new AppError(400, validationError);
    }

    const updatedUser = await updateUser(req.user!.userId, updates);
    
    // Remove sensitive information
    const { googleId, ...safeUser } = updatedUser;
    
    logger.info('User profile updated', {
      requestId,
      userId: req.user?.userId,
      updatedFields: Object.keys(updates)
    });

    res.json(safeUser);
  } catch (error) {
    logger.error('Error updating user profile', {
      requestId,
      userId: req.user?.userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(error);
  }
});

// Update user preferences
router.put('/preferences', authMiddleware, apiLimiter, async (req, res, next) => {
  const requestId = req.headers['x-request-id'];
  try {
    const { preferences } = req.body;
    
    if (!preferences || typeof preferences !== 'object') {
      throw new AppError(400, 'Invalid preferences format');
    }

    const updatedUser = await updateUser(req.user!.userId, { preferences });
    
    logger.info('User preferences updated', {
      requestId,
      userId: req.user?.userId,
      preferences: Object.keys(preferences)
    });

    res.json(updatedUser.preferences);
  } catch (error) {
    logger.error('Error updating user preferences', {
      requestId,
      userId: req.user?.userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(error);
  }
});

// Deactivate account
router.post('/deactivate', authMiddleware, apiLimiter, async (req, res, next) => {
  const requestId = req.headers['x-request-id'];
  try {
    await updateUser(req.user!.userId, {
      isActive: false,
      deactivatedAt: new Date().toISOString()
    });

    logger.info('User account deactivated', {
      requestId,
      userId: req.user?.userId
    });

    // Clear auth cookie
    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict'
    });

    res.json({ message: 'Account deactivated successfully' });
  } catch (error) {
    logger.error('Error deactivating user account', {
      requestId,
      userId: req.user?.userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(error);
  }
});

// Request data export
router.post('/export-data', authMiddleware, apiLimiter, async (req, res, next) => {
  const requestId = req.headers['x-request-id'];
  try {
    const user = await findUserById(req.user!.userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }

    // Collect user data
    const userData = {
      profile: {
        email: user.email,
        name: user.name,
        nickname: user.nickname,
        picture: user.picture,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      },
      preferences: user.preferences,
      // Add other user-related data here
    };

    logger.info('User data export requested', {
      requestId,
      userId: req.user?.userId
    });

    res.json(userData);
  } catch (error) {
    logger.error('Error exporting user data', {
      requestId,
      userId: req.user?.userId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    next(error);
  }
});

export default router; 