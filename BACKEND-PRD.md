# SwapJeet Frontend/Backend Split PRD

## Strategy for Splitting

### Document Organization
- **Backend PRD**: Server-side logic, APIs, data storage, authentication, real-time updates, and caching
- **Frontend PRD**: UI/UX, client-side logic, animations, state management, and API integration
- **Shared Sections**: Overview, Goals, User Personas, and User Flow (tailored per domain)

## Backend PRD: SwapJeet

### 1. Overview
SwapJeet is a web application that gamifies Ethereum wallet tracking, powered by a Node.js backend with Amazon DynamoDB for persistence, Amazon S3 for PNG storage, and Zapper.fi for wallet data. It handles authentication via Google OAuth, delivers real-time wallet updates via WebSocket, and calculates "paperhands" metrics, all optimized with aggressive caching for cost efficiency.

### 2. Goals

#### Functional Goals
- Aggregate wallet data
- Calculate sell losses
- Secure access with Google Sign-In
- Provide real-time updates
- Manage leaderboards
- Store PNGs in S3

#### Technical Goals
- Build a scalable, cost-efficient system using AWS (DynamoDB, S3)
- Implement caching within free tiers
- Utilize Socket.io for real-time features

#### Engagement Goals
- Support virality with leaderboard data
- Provide snarky fumble calculations

### 3. User Personas

#### Crypto Degen
- Needs real-time wallet pings and leaderboard metrics

#### Self-Aware Trader
- Requires detailed wallet data and custom alerts

#### Casual Observer
- Wants aggregated whale data and fumble stats

### 4. Backend Features & Requirements

#### 4.1 Authentication & Session Management

##### Google OAuth 2.0 Flow
```javascript
Endpoint: POST /api/auth/google
Input: Access token from frontend (@react-oauth/google)
Logic: 
- Verify token (google-auth-library)
- Extract userId, email
- If new user: PutItem to DynamoDB SwapJeetUsers
Response: 
- Issue JWT (24h expiry, payload: { userId, email, iat, exp })
- Set cookie: swapjeet_token (httpOnly, secure, SameSite: Strict)
Failure: Return 401 with "Login failed" message
```

##### Session Management
- Middleware: Validate `swapjeet_token` on private routes
- Logout: Clear cookie, emit WebSocket disconnect

##### Caching
```javascript
Session data: {
  MVP: "In-memory",
  Phase2: {
    type: "Redis",
    TTL: "24h",
    key: "user_session_{userId}"
  }
}
```

#### 4.2 Wallet Data Aggregation

##### Wallet Addition
```javascript
Endpoint: POST /api/wallets
Input: {
  address: string,  // regex: ^0x[a-fA-F0-9]{40}$
  nickname: string, // optional, max 20 chars
  tag: string      // enum: "Me", "Whale", "Friend", "Other"
}
Validation: Query Zapper.fi /v1/balances/tokens
Storage: DynamoDB SwapJeetWallets
```

##### Real-time Updates
```javascript
WebSocket: {
  type: "Socket.io",
  pollInterval: "5 minutes",
  threshold: "5% net worth change",
  event: "wallet_update",
  payload: { address, netWorth }
}
```

##### Caching Strategy
```javascript
Wallets: {
  type: "Redis/memory",
  TTL: "15 mins",
  key: "user_wallets_{userId}"
}
NetWorth: {
  type: "Redis/memory",
  TTL: "15 mins",
  key: "wallet_net_worth_{address}"
}
```

#### 4.3 Wallet Management
Endpoints:  
DELETE /api/wallets/{address}: DeleteItem from SwapJeetWallets.  
PATCH /api/wallets/{address}: UpdateItem for nickname, tag, isPinned.  
PUT /api/wallets/order: Update userPrefs.walletOrder with reordered list.

#### 4.4 Leaderboard
Endpoint: GET /api/leaderboard.  
Logic: Scan SwapJeetWallets for users with userPrefs.showLeaderboard: true.  
Metrics: Biggest fumble (total lost profit), most wallets tracked.  
Output: Anonymized list (e.g., User_X), top 10.
Caching: Redis/memory (TTL: 1h, key: leaderboard_jeets).

#### 4.5 Wallet Details
Endpoint: GET /api/wallets/{address}.  
Data: Zapper.fi /v1/balances/tokens (tokens, net worth).  
Insights: Calculate top gainer/loser (24h % change).  
Trend: Aggregate 7-day net worth (Zapper or CoinGecko).
Caching:  
Tokens: Redis/memory (TTL: 15 mins, key: wallet_details_{address}).  
Trend: Redis/memory (TTL: 1h, key: wallet_trend_{address}).

#### 4.6 Paperhands Calculator
Endpoint: GET /api/fumbles/{address}.  
Data:  
Zapper.fi (/v1/transactions).  
Etherscan (txlist, backup).  
CoinGecko (/coins/{id}/history).
Logic:  
Filter sell/swap txs (type: "transfer" or swap).  
Per tx:  
Sale price: CoinGecko at timestamp.  
Peak price: 30 days before/after.  
Early: (Peak After - Sale) * Amount.  
Late: (Sale - Peak Before) * Amount.  
Label: "Too Early"/"Too Late".
Jeet Score: (totalLost / maxPossible) * 100 (0-100).
Output: { transactions: [], totalLoss, jeetScore, rank }.
PNG Export:  
Endpoint: POST /api/fumbles/{address}/export.  
Logic: Generate PNG (top 5 fumbles, Jeet Score, nickname, watermark).  
Upload: S3 (fumbles/{userId}/{address}/{timestamp}.png).  
Response: Presigned URL (TTL: 7 days).
Caching:  
Txs: Redis/memory (TTL: 24h, key: wallet_txs_{address}).  
Prices: Redis/memory (TTL: 24h, key: price_{token_id}_{date}).  
Fumbles: Redis/memory (TTL: 24h, key: fumble_results_{address}).

#### 4.7 User Preferences
Endpoint: PATCH /api/prefs.  
Input: { alerts, showLeaderboard, walletOrder, hideSmall, fumbleTheme, achievements }.  
Storage: Update SwapJeetUsers.prefs (JSON).

### 5. Technical Stack
Framework: Node.js v20.x, Express.js v4.x.  
Database: DynamoDB.  
SwapJeetUsers: userId, email, theme, nickname, bio, createdAt, prefs (JSON).  
SwapJeetWallets: userId, address, nickname, tag, addedAt, isPinned, netWorthHistory.
Storage: S3 (swapjeet-assets).  
Auth: Google OAuth, JWT.  
Real-time: Socket.io (poll Zapper, emit wallet_update).  
Caching: In-memory (MVP), Redis (Phase 2).  
APIs:  
Zapper.fi: Cached.  
Etherscan: Cached.  
CoinGecko: Cached.  
AWS SDK: DynamoDB, S3.

### 6. User Flow (Backend Perspective)
Homepage: Handle auth redirect, store new users.  
Dashboard: Serve wallet data, manage updates via WebSocket.  
Details: Provide token details and trends.  
Fumbles: Calculate fumbles, generate PNGs.  
Profile: Update preferences, handle logout.