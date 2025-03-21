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
- 📊 Wallet Data Aggregation via Zapper GraphQL API
  - Real-time token balances
  - Multi-network support (Ethereum, Base, Polygon, etc.)
  - Token metadata and prices
  - Total portfolio value
- ⚡ Real-time Wallet Updates
- 📈 Paperhands Calculator
- 🏆 Leaderboard System
- 🖼️ PNG Export Generation
- 💾 User Preferences Management

## External API Integrations

- Zapper.fi GraphQL API
  - Portfolio data via `portfolioV2` query
  - Token balances and metadata
  - Multi-network support
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

[![API Docs](https://img.shields.io/badge/API%20Documentation-Swagger-green)](./src/swagger.yaml)
[![OpenAPI 3.0](https://img.shields.io/badge/OpenAPI-3.0-blue)](https://swagger.io/specification/)

### Available Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/api/wallets` | Get user's wallets |
| POST   | `/api/wallets` | Add a new wallet |
| GET    | `/api/wallets/{address}` | Get wallet details with token balances |
| GET    | `/api/wallets/{address}?refresh=true` | Force refresh wallet data |
| PATCH  | `/api/wallets/{address}` | Update wallet |
| DELETE | `/api/wallets/{address}` | Delete wallet |
| GET    | `/api/wallets/{address}/fumbles` | Get wallet fumbles |
| POST   | `/api/wallets/{address}/export` | Export fumbles as PNG |
| GET    | `/api/preferences` | Get user preferences |
| PATCH  | `/api/preferences` | Update user preferences |

### Wallet Details Response

The wallet details endpoint returns:
- Token balances across multiple networks
- Token metadata (symbol, name, decimals)
- Current prices and USD values
- Total portfolio value
- Top holdings sorted by value

### Authentication

All endpoints require authentication via JWT token in a cookie named `swapjeet_token`.

### Rate Limiting

- 10 requests per minute per IP address
- Wallet details cached for 5 minutes
- Leaderboard data cached for 1 hour
- Transaction data cached for 24 hours

For detailed API documentation including request/response schemas, run the server and visit `/api-docs`.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
