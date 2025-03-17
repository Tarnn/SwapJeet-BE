import { createCanvas, loadImage } from 'canvas';
import { FumbleResult } from '../services/zapper';
import { Wallet } from '../types/wallet';

// Score card interfaces and types
interface FumbleResult {
  transactions: {
    token: string;
    amount: number;
    loss: number;
    type: 'Early' | 'Late';
  }[];
  totalLoss: number;
  jeetScore: number;
  rank: number;
}

interface Wallet {
  nickname?: string;
  address: string;
}

interface ScoreCard {
  wallet: {
    displayName: string;
    address: string;
  };
  score: {
    value: number;
    rank: string;
    rankColor: string;
  };
  topFumbles: {
    token: string;
    amount: number;
    loss: number;
    type: string;
  }[];
  metadata: {
    timestamp: string;
    version: string;
  };
}

export async function generateFumbleImage(fumbles: FumbleResult, wallet: Wallet): Promise<Buffer> {
  // Create canvas
  const canvas = createCanvas(800, 600);
  const ctx = canvas.getContext('2d');

  // Set background
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, 800, 600);

  // Draw title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px Arial';
  ctx.fillText(`Wallet Fumbles - ${wallet.nickname || wallet.address}`, 40, 40);

  // Draw jeet score
  ctx.font = 'bold 36px Arial';
  ctx.fillStyle = '#ff4444';
  ctx.fillText(`Jeet Score: ${fumbles.jeetScore}`, 40, 100);

  // Draw total loss
  ctx.font = '20px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`Total Loss: $${fumbles.totalLoss.toLocaleString()}`, 40, 140);

  // Draw transactions
  let y = 200;
  fumbles.transactions.forEach((tx, i) => {
    if (i < 5) { // Show top 5 fumbles
      ctx.font = '16px Arial';
      ctx.fillStyle = '#cccccc';
      ctx.fillText(`${tx.token} - ${new Date(tx.timestamp).toLocaleDateString()}`, 40, y);
      ctx.fillText(`Loss: $${tx.loss.toLocaleString()}`, 40, y + 20);
      ctx.fillText(`Sold at $${tx.price.toLocaleString()} - Peak: $${tx.peakPrice.toLocaleString()}`, 40, y + 40);
      y += 80;
    }
  });

  // Return buffer
  return canvas.toBuffer('image/png');
}

function getRankText(rank: number): string {
  switch (rank) {
    case 1: return '💎 DIAMOND HANDS';
    case 2: return '📜 PAPER HANDS';
    case 3: return '🤝 WEAK HANDS';
    case 4: return '🤲 SHAKY HANDS';
    default: return '👐 NORMAL TRADER';
  }
}

function getRankColor(rank: number): string {
  switch (rank) {
    case 1: return '#7b61ff'; // Purple
    case 2: return '#ff4d4d'; // Red
    case 3: return '#ffa64d'; // Orange
    case 4: return '#ffdb4d'; // Yellow
    default: return '#4dff88'; // Green
  }
} 