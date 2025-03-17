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
  const scoreCard: ScoreCard = {
    wallet: {
      displayName: wallet.nickname || `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`,
      address: wallet.address
    },
    score: {
      value: fumbles.jeetScore,
      rank: getRankText(fumbles.rank),
      rankColor: getRankColor(fumbles.rank)
    },
    topFumbles: fumbles.transactions
      .sort((a, b) => b.loss - a.loss)
      .slice(0, 3)
      .map(fumble => ({
        token: fumble.token,
        amount: fumble.amount,
        loss: fumble.loss,
        type: `Sold ${fumble.type}`
      })),
    metadata: {
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }
  };

  // Convert the score card to a JSON string with formatting
  const jsonString = JSON.stringify(scoreCard, null, 2);
  
  // Return the JSON as a buffer
  return Buffer.from(jsonString);
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