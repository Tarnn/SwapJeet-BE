import { utils } from 'ethers';
import { UpdateUserDto, UserPreferences } from '../interfaces/user.interface';

export const validateAddress = (address: string): boolean => {
  try {
    return utils.isAddress(address);
  } catch {
    return false;
  }
};

export const validateTag = (tag: string): boolean => {
  const validTags = ['Me', 'Whale', 'Friend', 'Other'];
  return validTags.includes(tag);
};

export const validateNickname = (nickname: string): boolean => {
  return nickname.length <= 20 && /^[a-zA-Z0-9-_\s]+$/.test(nickname);
};

export const sanitizeString = (str: string): string => {
  return str.replace(/[<>]/g, '').trim();
};

export const validateUserUpdate = (updates: UpdateUserDto): string | null => {
  // Validate name
  if (updates.name !== undefined) {
    if (typeof updates.name !== 'string' || updates.name.length < 2 || updates.name.length > 50) {
      return 'Name must be between 2 and 50 characters';
    }
  }

  // Validate nickname
  if (updates.nickname !== undefined) {
    if (typeof updates.nickname !== 'string' || updates.nickname.length < 2 || updates.nickname.length > 30) {
      return 'Nickname must be between 2 and 30 characters';
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(updates.nickname)) {
      return 'Nickname can only contain letters, numbers, underscores, and hyphens';
    }
  }

  // Validate picture URL
  if (updates.picture !== undefined) {
    try {
      new URL(updates.picture);
    } catch {
      return 'Invalid picture URL';
    }
  }

  // Validate preferences
  if (updates.preferences !== undefined) {
    const validationError = validateUserPreferences(updates.preferences);
    if (validationError) {
      return validationError;
    }
  }

  return null;
};

export const validateUserPreferences = (preferences: UserPreferences): string | null => {
  // Validate email notifications
  if (preferences.emailNotifications !== undefined && 
      typeof preferences.emailNotifications !== 'boolean') {
    return 'Email notifications must be a boolean value';
  }

  // Validate theme
  if (preferences.theme !== undefined && 
      !['light', 'dark'].includes(preferences.theme)) {
    return 'Theme must be either "light" or "dark"';
  }

  // Validate language
  if (preferences.language !== undefined) {
    if (typeof preferences.language !== 'string' || 
        preferences.language.length !== 2) {
      return 'Language must be a valid 2-letter ISO code';
    }
  }

  return null;
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password: string): string | null => {
  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  if (!/[!@#$%^&*]/.test(password)) {
    return 'Password must contain at least one special character (!@#$%^&*)';
  }
  return null;
}; 