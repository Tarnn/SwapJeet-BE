export interface UserPreferences {
  alerts: {
    enabled: boolean;
    threshold: number;
    email: boolean;
    push: boolean;
  };
  showLeaderboard: boolean;
  walletOrder: string[];
  hideSmall: boolean;
  fumbleTheme: 'default' | 'dark' | 'light';
  achievements: {
    showOnProfile: boolean;
    notifications: boolean;
  };
}

export interface User {
  userId: string;
  email: string;
  googleId: string;
  nickname?: string;
  bio?: string;
  createdAt: string;
  prefs: UserPreferences;
}

export interface CreateUserInput {
  email: string;
  googleId: string;
  createdAt: string;
  nickname?: string;
}

export interface UpdateUserPreferencesInput {
  showLeaderboard?: boolean;
  walletOrder?: string[];
  hideSmall?: boolean;
  fumbleTheme?: string;
} 