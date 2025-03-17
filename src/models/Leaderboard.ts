import { FumbleTransaction } from './Wallet';

export interface LeaderboardEntry {
  userId: string;
  address: string;
  nickname?: string;
  totalLoss: number;
  jeetScore: number;
  rank: number;
  transactions: FumbleTransaction[];
}

export interface LeaderboardStats {
  totalUsers: number;
  totalLoss: number;
  averageLoss: number;
  topFumbler: {
    address: string;
    nickname?: string;
    loss: number;
  };
}

export interface LeaderboardPeriod {
  start: string;
  end: string;
  entries: LeaderboardEntry[];
  stats: LeaderboardStats;
}

export interface LeaderboardData {
  daily: LeaderboardPeriod;
  weekly: LeaderboardPeriod;
  monthly: LeaderboardPeriod;
  allTime: LeaderboardPeriod;
}

export type LeaderboardTimeframe = 'daily' | 'weekly' | 'monthly' | 'allTime'; 