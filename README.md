# SwapJeet Backend

Backend service for SwapJeet - A gamified Ethereum wallet tracking application that calculates and showcases "paperhands" metrics.

## Overview

SwapJeet's backend is built with Node.js and provides APIs for wallet tracking, real-time updates, and "paperhands" calculations. It integrates with various services including Zapper.fi for wallet data, and uses AWS services (DynamoDB, S3) for data persistence.

Frontend Repository: [SwapJeet Frontend](https://github.com/Tarnn/SwapJeet)

## Tech Stack

- **Runtime**: Node.js v20.x
- **Framework**: Express.js v4.x
- **Database**: Amazon DynamoDB
- **Storage**: Amazon S3 (for PNG exports)
- **Real-time Updates**: Socket.io
- **Authentication**: Google OAuth 2.0
- **Caching**: In-memory (MVP), Redis (Phase 2)

## Core Features

- 🔐 Google OAuth Authentication
- 📊 Wallet Data Aggregation
- ⚡ Real-time Wallet Updates
- 📈 Paperhands Calculator
- 🏆 Leaderboard System
- 🖼️ PNG Export Generation
- 💾 User Preferences Management

## External API Integrations

- Zapper.fi - Wallet data and transactions
- Etherscan - Backup transaction data
- CoinGecko - Historical price data

## Database Schema

### SwapJeetUsers
- userId
- email
- theme
- nickname
- bio
- createdAt
- prefs (JSON)

### SwapJeetWallets
- userId
- address
- nickname
- tag
- addedAt
- isPinned
- netWorthHistory

## Getting Started

1. Clone the repository:
```bash
git clone https://github.com/your-username/SwapJeet-BE.git
cd SwapJeet-BE
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Required environment variables:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ZAPPER_API_KEY`
- `ETHERSCAN_API_KEY`
- `JWT_SECRET`

4. Start the development server:
```bash
npm run dev
```

## API Documentation

Detailed API documentation will be available at `/api-docs` when running the server.

### Main Endpoints

- `POST /api/auth/google` - Google OAuth authentication
- `POST /api/wallets` - Add wallet for tracking
- `GET /api/wallets/{address}` - Get wallet details
- `GET /api/fumbles/{address}` - Calculate paperhands metrics
- `GET /api/leaderboard` - Get global leaderboard
- `PATCH /api/prefs` - Update user preferences

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
