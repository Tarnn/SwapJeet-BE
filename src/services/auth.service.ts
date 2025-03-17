import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { User, UserAction } from '../interfaces/user.interface';
import { findUserByEmail, updateUser } from './user.service';
import { logUserActivity } from './activity.service';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';
import { generateToken } from '../utils/auth';

const SALT_ROUNDS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION = 30 * 60 * 1000; // 30 minutes

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

export const verifyPassword = async (password: string, hashedPassword: string): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

export const setPassword = async (userId: string, password: string): Promise<void> => {
  const hashedPassword = await hashPassword(password);
  await updateUser(userId, {
    password: hashedPassword,
    updatedAt: new Date().toISOString()
  });

  await logUserActivity({
    userId,
    action: UserAction.PASSWORD_CHANGED,
    details: {
      timestamp: new Date().toISOString()
    }
  });
};

export const loginWithPassword = async (
  email: string,
  password: string,
  ip?: string,
  userAgent?: string
): Promise<{ user: User; token: string }> => {
  const user = await findUserByEmail(email);
  if (!user) {
    throw new AppError(401, 'Invalid credentials');
  }

  // Check if account is locked
  if (user.accountLocked && user.lockExpiresAt) {
    const lockExpiry = new Date(user.lockExpiresAt);
    if (lockExpiry > new Date()) {
      const remainingTime = Math.ceil((lockExpiry.getTime() - Date.now()) / 1000 / 60);
      throw new AppError(423, `Account is locked. Try again in ${remainingTime} minutes`);
    }
    // Reset lock if expired
    await updateUser(user.userId, {
      accountLocked: false,
      lockExpiresAt: undefined,
      failedLoginAttempts: 0
    });
  }

  // Verify password
  if (!user.password) {
    throw new AppError(401, 'Password login not enabled for this account');
  }

  const isValid = await verifyPassword(password, user.password);
  
  if (!isValid) {
    const failedAttempts = (user.failedLoginAttempts || 0) + 1;
    const updates: any = {
      failedLoginAttempts: failedAttempts,
      lastFailedLogin: new Date().toISOString()
    };

    // Lock account if too many failed attempts
    if (failedAttempts >= MAX_LOGIN_ATTEMPTS) {
      updates.accountLocked = true;
      updates.lockExpiresAt = new Date(Date.now() + LOCK_DURATION).toISOString();
    }

    await updateUser(user.userId, updates);
    
    await logUserActivity({
      userId: user.userId,
      action: UserAction.LOGIN_FAILED,
      details: {
        ip,
        userAgent,
        reason: 'Invalid password',
        attemptNumber: failedAttempts
      }
    });

    throw new AppError(401, 'Invalid credentials');
  }

  // Reset failed attempts on successful login
  await updateUser(user.userId, {
    failedLoginAttempts: 0,
    lastLogin: new Date().toISOString()
  });

  // Generate JWT token
  const token = generateToken({
    userId: user.userId,
    email: user.email
  });

  await logUserActivity({
    userId: user.userId,
    action: UserAction.LOGIN_SUCCESS,
    details: {
      ip,
      userAgent,
      method: 'password'
    }
  });

  return { user, token };
};

export const generatePasswordResetToken = async (email: string): Promise<string> => {
  const user = await findUserByEmail(email);
  if (!user) {
    // Don't reveal if email exists
    return '';
  }

  const resetToken = uuidv4();
  const resetTokenExpiry = new Date(Date.now() + 3600000).toISOString(); // 1 hour

  await updateUser(user.userId, {
    resetToken,
    resetTokenExpiry
  });

  await logUserActivity({
    userId: user.userId,
    action: UserAction.PASSWORD_RESET_REQUEST,
    details: {
      timestamp: new Date().toISOString()
    }
  });

  return resetToken;
};

export const resetPassword = async (
  resetToken: string,
  newPassword: string
): Promise<void> => {
  // Find user by reset token
  const user = await findUserByEmail(resetToken);
  if (!user || !user.resetTokenExpiry || new Date(user.resetTokenExpiry) < new Date()) {
    throw new AppError(400, 'Invalid or expired reset token');
  }

  const hashedPassword = await hashPassword(newPassword);
  
  await updateUser(user.userId, {
    password: hashedPassword,
    resetToken: undefined,
    resetTokenExpiry: undefined,
    lastPasswordChange: new Date().toISOString()
  });

  await logUserActivity({
    userId: user.userId,
    action: UserAction.PASSWORD_CHANGE,
    details: {
      method: 'reset'
    }
  });
}; 