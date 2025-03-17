import { Router } from 'express';
import { verifyGoogleToken, generateToken } from '../utils/auth';
import { createUser, findUserByEmail } from '../services/user.service';
import { AppError } from '../middleware/errorHandler';

const router = Router();

router.post('/google', async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      throw new AppError(400, 'Token is required');
    }

    const { email, sub: googleId } = await verifyGoogleToken(token);
    
    // Find or create user
    let user = await findUserByEmail(email);
    
    if (!user) {
      user = await createUser({
        email,
        googleId,
        createdAt: new Date().toISOString()
      });
    }

    // Generate JWT
    const authToken = generateToken({
      userId: user.userId,
      email: user.email
    });

    res.status(200).json({
      token: authToken,
      user: {
        userId: user.userId,
        email: user.email,
        nickname: user.nickname
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router; 