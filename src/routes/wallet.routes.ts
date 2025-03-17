import { Router } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { 
  addWallet, 
  removeWallet, 
  updateWallet,
  getWalletDetails,
  getWalletFumbles,
  exportFumbles,
  getUserWallets
} from '../services/wallet.service';
import { validateAddress } from '../utils/validation';

const router = Router();

// Get user's wallets
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError(401, 'User not authenticated');

    const wallets = await getUserWallets(userId);
    res.json(wallets);
  } catch (error) {
    next(error);
  }
});

// Add new wallet
router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError(401, 'User not authenticated');

    const { address, nickname, tag } = req.body;
    
    if (!address || !validateAddress(address)) {
      throw new AppError(400, 'Invalid Ethereum address');
    }

    const wallet = await addWallet(userId, {
      address: address.toLowerCase(),
      nickname,
      tag
    });

    res.status(201).json(wallet);
  } catch (error) {
    next(error);
  }
});

// Get wallet details
router.get('/:address', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError(401, 'User not authenticated');

    const { address } = req.params;
    if (!validateAddress(address)) {
      throw new AppError(400, 'Invalid Ethereum address');
    }

    const details = await getWalletDetails(address.toLowerCase());
    res.json(details);
  } catch (error) {
    next(error);
  }
});

// Update wallet
router.patch('/:address', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError(401, 'User not authenticated');

    const { address } = req.params;
    const { nickname, tag, isPinned } = req.body;

    if (!validateAddress(address)) {
      throw new AppError(400, 'Invalid Ethereum address');
    }

    const wallet = await updateWallet(userId, address.toLowerCase(), {
      nickname,
      tag,
      isPinned
    });

    res.json(wallet);
  } catch (error) {
    next(error);
  }
});

// Delete wallet
router.delete('/:address', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError(401, 'User not authenticated');

    const { address } = req.params;
    if (!validateAddress(address)) {
      throw new AppError(400, 'Invalid Ethereum address');
    }

    await removeWallet(userId, address.toLowerCase());
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Get wallet fumbles
router.get('/:address/fumbles', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError(401, 'User not authenticated');

    const { address } = req.params;
    if (!validateAddress(address)) {
      throw new AppError(400, 'Invalid Ethereum address');
    }

    const fumbles = await getWalletFumbles(address.toLowerCase());
    res.json(fumbles);
  } catch (error) {
    next(error);
  }
});

// Export fumbles as PNG
router.post('/:address/fumbles/export', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) throw new AppError(401, 'User not authenticated');

    const { address } = req.params;
    if (!validateAddress(address)) {
      throw new AppError(400, 'Invalid Ethereum address');
    }

    const imageUrl = await exportFumbles(userId, address.toLowerCase());
    res.json({ url: imageUrl });
  } catch (error) {
    next(error);
  }
});

export default router; 