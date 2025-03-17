import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../middleware/errorHandler';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = `${process.env.DYNAMODB_TABLE_PREFIX}users`;

interface User {
  userId: string;
  email: string;
  googleId: string;
  nickname?: string;
  theme?: string;
  createdAt: string;
  prefs?: {
    showLeaderboard: boolean;
    walletOrder: string[];
    hideSmall: boolean;
    fumbleTheme: string;
  };
}

interface CreateUserInput {
  email: string;
  googleId: string;
  createdAt: string;
  nickname?: string;
}

export const createUser = async (input: CreateUserInput): Promise<User> => {
  const userId = uuidv4();
  const user: User = {
    userId,
    email: input.email,
    googleId: input.googleId,
    nickname: input.nickname,
    createdAt: input.createdAt,
    prefs: {
      showLeaderboard: true,
      walletOrder: [],
      hideSmall: false,
      fumbleTheme: 'default'
    }
  };

  try {
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: user,
      ConditionExpression: 'attribute_not_exists(email)'
    }));

    return user;
  } catch (error) {
    throw new AppError(500, 'Failed to create user');
  }
};

export const findUserByEmail = async (email: string): Promise<User | null> => {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email
      }
    }));

    return result.Items?.[0] as User || null;
  } catch (error) {
    throw new AppError(500, 'Failed to find user');
  }
};

export const findUserById = async (userId: string): Promise<User | null> => {
  try {
    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        userId
      }
    }));

    return result.Item as User || null;
  } catch (error) {
    throw new AppError(500, 'Failed to find user');
  }
};

export const updateUserPreferences = async (
  userId: string,
  prefs: Partial<User['prefs']>
): Promise<User> => {
  try {
    const user = await findUserById(userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }

    const updatedPrefs = {
      ...user.prefs,
      ...prefs
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        ...user,
        prefs: updatedPrefs
      }
    }));

    return {
      ...user,
      prefs: updatedPrefs
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(500, 'Failed to update user preferences');
  }
}; 