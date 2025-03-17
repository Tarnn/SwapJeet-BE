# SwapJeet API Postman Collection

This collection contains all the API endpoints for the SwapJeet application, allowing you to track Ethereum wallet fumbles and manage leaderboards.

## Setup Instructions

1. Import the collection:
   - Open Postman
   - Click "Import" button
   - Select `SwapJeet.postman_collection.json`

2. Import the environment:
   - Click "Import" button again
   - Select `SwapJeet.postman_environment.json`
   - Click the environment dropdown in the top right
   - Select "SwapJeet Environment"

3. Set up environment variables:
   - Click the "eye" icon in the top right
   - Click "Edit" for the SwapJeet Environment
   - Fill in the following variables as needed:
     - `baseUrl`: Your API base URL (default: http://localhost:3000/api)
     - `authToken`: Will be set automatically after login
     - `csrfToken`: Will be set from the server's CSRF token
     - `userId`: Your user ID (set after login)
     - `address`: Ethereum wallet address for testing
     - `googleToken`: Your Google OAuth token
     - `resetToken`: Password reset token (received via email)

## Authentication

The collection uses cookie-based authentication. After successful login (either via Google OAuth or password), the `authToken` will be automatically set in your cookies.

All requests that require authentication will automatically include the auth cookie.

## CSRF Protection

All POST, PUT, PATCH, and DELETE requests require a CSRF token in the `X-XSRF-TOKEN` header. The token is automatically included in all requests through the `{{csrfToken}}` variable.

## Available Endpoints

### Authentication
- POST `/auth/google` - Google OAuth login
- POST `/auth/login` - Password-based login
- POST `/auth/set-password` - Set password for Google-authenticated users
- POST `/auth/forgot-password` - Request password reset
- POST `/auth/reset-password` - Reset password with token
- POST `/auth/logout` - Logout

### Wallets
- GET `/wallets` - Get user's wallets
- POST `/wallets` - Add new wallet
- GET `/wallets/{address}` - Get wallet details
- PATCH `/wallets/{address}` - Update wallet
- DELETE `/wallets/{address}` - Delete wallet
- GET `/wallets/{address}/fumbles` - Get wallet fumbles
- POST `/wallets/{address}/export` - Export fumbles as PNG

### User Preferences
- GET `/preferences` - Get user preferences
- PATCH `/preferences` - Update user preferences

## Rate Limiting

The API implements rate limiting on authentication endpoints:
- 5 attempts per IP address per 15 minutes for authentication endpoints
- Other endpoints have different rate limits as specified in the API documentation

## Response Formats

All responses are in JSON format. Error responses follow this structure:
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## Testing Tips

1. Start with authentication:
   - Use the Google OAuth login or password login endpoint
   - The auth token will be automatically set in cookies

2. Test wallet operations:
   - Add a wallet using a valid Ethereum address
   - Get wallet details and verify the response
   - Try updating wallet nickname and tags
   - Test fumble calculation with different timeframes

3. Test user preferences:
   - Get current preferences
   - Update preferences and verify changes
   - Test various preference combinations

## Error Handling

The collection includes example responses for various error scenarios:
- 400 Bad Request - Invalid input
- 401 Unauthorized - Authentication required
- 403 Forbidden - Invalid CSRF token
- 404 Not Found - Resource not found
- 409 Conflict - Resource already exists
- 429 Too Many Requests - Rate limit exceeded 