import { Router } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getLeaderboard } from '../services/leaderboard.service';

const router = Router();

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError(401, 'User not authenticated');

    const leaderboard = await getLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    next(error);
  }
});

export default router; 