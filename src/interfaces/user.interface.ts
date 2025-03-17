export interface User {
  userId: string;
  email: string;
  googleId?: string;
  name?: string;
  nickname?: string;
  picture?: string;
  password?: string;
  resetToken?: string;
  resetTokenExpiry?: string;
  createdAt: string;
  lastLogin?: string;
  isActive: boolean;
  deactivatedAt?: string;
  role: UserRole;
  preferences: UserPreferences;
  securitySettings?: SecuritySettings;
  lastPasswordChange?: string;
  failedLoginAttempts: number;
  lastFailedLogin?: string;
  accountLocked?: boolean;
  lockExpiresAt?: string;
  updatedAt: string;
}

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR'
}

export interface UserPreferences {
  emailNotifications: boolean;
  theme: 'light' | 'dark';
  language: string;
  timezone?: string;
  currency?: string;
  notificationPreferences?: {
    email?: boolean;
    push?: boolean;
    walletAlerts?: boolean;
    securityAlerts?: boolean;
    marketingEmails?: boolean;
  };
}

export interface SecuritySettings {
  twoFactorEnabled: boolean;
  twoFactorSecret?: string;
  backupCodes?: string[];
  trustedDevices: TrustedDevice[];
  loginHistory?: LoginHistoryEntry[];
}

export interface TrustedDevice {
  deviceId: string;
  deviceName: string;
  userAgent: string;
  lastUsed: string;
  ipAddress: string;
}

export interface LoginHistoryEntry {
  timestamp: string;
  ipAddress: string;
  userAgent: string;
  success: boolean;
  failureReason?: string;
}

export interface CreateUserDto {
  email: string;
  name?: string;
  nickname?: string;
  picture?: string;
  googleId?: string;
  password?: string;
}

export interface UpdateUserDto {
  name?: string;
  nickname?: string;
  picture?: string;
  preferences?: Partial<UserPreferences>;
  securitySettings?: Partial<SecuritySettings>;
  password?: string;
  resetToken?: string;
  resetTokenExpiry?: string;
  failedLoginAttempts?: number;
  lastFailedLogin?: string;
  accountLocked?: boolean;
  lockExpiresAt?: string;
  lastLogin?: string;
  isActive?: boolean;
  deactivatedAt?: string;
}

export interface UserActivityLog {
  userId: string;
  action: UserAction;
  timestamp: string;
  details?: Record<string, any>;
}

export enum UserAction {
  ACCOUNT_CREATED = 'ACCOUNT_CREATED',
  PROFILE_UPDATED = 'PROFILE_UPDATED',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET = 'PASSWORD_RESET',
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGOUT = 'LOGOUT',
  ACCOUNT_DEACTIVATED = 'ACCOUNT_DEACTIVATED',
  ACCOUNT_REACTIVATED = 'ACCOUNT_REACTIVATED',
  TWO_FACTOR_ENABLED = 'TWO_FACTOR_ENABLED',
  TWO_FACTOR_DISABLED = 'TWO_FACTOR_DISABLED',
  DEVICE_ADDED = 'DEVICE_ADDED',
  DEVICE_REMOVED = 'DEVICE_REMOVED'
} 