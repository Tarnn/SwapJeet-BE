import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';

// DynamoDB Client
export const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION
});

export const docClient = DynamoDBDocumentClient.from(dynamoClient);

// S3 Client
export const s3Client = new S3Client({
  region: process.env.AWS_REGION
});

// Table Names
export const TABLES = {
  USERS: `${process.env.DYNAMODB_TABLE_PREFIX}users`,
  WALLETS: `${process.env.DYNAMODB_TABLE_PREFIX}wallets`
} as const;

// S3 Configuration
export const S3_CONFIG = {
  BUCKET_NAME: process.env.S3_BUCKET_NAME,
  FUMBLES_PREFIX: 'fumbles'
} as const;

// DynamoDB table names
export const USERS_TABLE = 'swapjeet-users';
export const WALLETS_TABLE = 'swapjeet-wallets';
export const LEADERBOARD_TABLE = 'swapjeet-leaderboard';

// S3 configuration
export const S3_BUCKET = 'swapjeet-assets';
export const AVATAR_PREFIX = 'avatars/';

// Initialize AWS clients
export const dynamoDb = new DynamoDBClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

export const s3 = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1'
}); 