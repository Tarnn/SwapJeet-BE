import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger';
import { AppError } from '../utils/AppError';
import { User, CreateUserDto, UpdateUserDto, UserRole, UserAction, SecuritySettings } from '../interfaces/user.interface';
import { logUserActivity } from './activity.service';
import NodeCache from 'node-cache';
import { QueryCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import dynamoDB from '../config/dynamodb';

const userCache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

const TABLE_NAME = process.env.USERS_TABLE || 'users';

export async function findUserByEmail(email: string): Promise<User | null> {
  const cacheKey = `user:${email}`;
  const cachedUser = userCache.get<User>(cacheKey);
  
  if (cachedUser) {
    logger.debug('User found in cache', { email });
    return cachedUser;
  }

  try {
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: {
        ':email': email
      }
    });

    const result = await dynamoDB.send(command);
    
    if (!result.Items || result.Items.length === 0) {
      logger.debug('User not found', { email });
      return null;
    }

    const user = result.Items[0] as User;
    userCache.set(cacheKey, user);
    logger.debug('User found and cached', { email });
    
    return user;
  } catch (error) {
    logger.error('Error finding user by email', { 
      email, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    throw new AppError(500, 'Error finding user');
  }
}

export async function findUserById(userId: string): Promise<User | null> {
  const cacheKey = `user:id:${userId}`;
  const cachedUser = userCache.get<User>(cacheKey);
  
  if (cachedUser) {
    logger.debug('User found in cache', { userId });
    return cachedUser;
  }

  try {
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        userId
      }
    });

    const result = await dynamoDB.send(command);
    
    if (!result.Item) {
      logger.debug('User not found', { userId });
      return null;
    }

    const user = result.Item as User;
    userCache.set(cacheKey, user);
    logger.debug('User found and cached', { userId });
    
    return user;
  } catch (error) {
    logger.error('Error finding user by ID', { 
      userId, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    throw new AppError(500, 'Error finding user');
  }
}

export async function createUser(userData: CreateUserDto): Promise<User> {
  try {
    const userId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const user: User = {
      userId,
      ...userData,
      createdAt: timestamp,
      updatedAt: timestamp,
      isActive: true,
      role: UserRole.USER,
      failedLoginAttempts: 0,
      preferences: {
        emailNotifications: true,
        theme: 'light',
        language: 'en'
      }
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: user,
      ConditionExpression: 'attribute_not_exists(email)'
    });

    await dynamoDB.send(command);
    
    logger.info('User created successfully', { 
      userId,
      email: userData.email 
    });

    await logUserActivity({
      userId,
      action: UserAction.ACCOUNT_CREATED,
      timestamp,
      details: {
        method: userData.googleId ? 'GOOGLE' : 'EMAIL'
      }
    });

    return user;
  } catch (error) {
    if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
      logger.warn('Attempt to create duplicate user', { email: userData.email });
      throw new AppError(409, 'User with this email already exists');
    }

    logger.error('Error creating user', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userData 
    });
    throw new AppError(500, 'Error creating user');
  }
}

export async function updateUser(userId: string, updates: UpdateUserDto): Promise<User> {
  try {
    const user = await findUserById(userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }

    const timestamp = new Date().toISOString();
    
    // Handle security settings update
    let securitySettings: SecuritySettings | undefined = user.securitySettings;
    if (updates.securitySettings) {
      securitySettings = {
        twoFactorEnabled: updates.securitySettings.twoFactorEnabled ?? user.securitySettings?.twoFactorEnabled ?? false,
        twoFactorSecret: updates.securitySettings.twoFactorSecret ?? user.securitySettings?.twoFactorSecret,
        backupCodes: updates.securitySettings.backupCodes ?? user.securitySettings?.backupCodes,
        trustedDevices: updates.securitySettings.trustedDevices ?? user.securitySettings?.trustedDevices ?? []
      };
    }

    const updatedUser: User = {
      ...user,
      ...updates,
      updatedAt: timestamp,
      preferences: {
        ...user.preferences,
        ...(updates.preferences || {})
      },
      securitySettings
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: updatedUser,
      ConditionExpression: 'attribute_exists(userId)'
    });

    await dynamoDB.send(command);
    
    // Clear cache entries
    userCache.del(`user:id:${userId}`);
    if (user.email) userCache.del(`user:${user.email}`);
    
    logger.info('User updated successfully', { 
      userId,
      updates: Object.keys(updates)
    });

    await logUserActivity({
      userId,
      action: UserAction.PROFILE_UPDATED,
      timestamp,
      details: {
        updatedFields: Object.keys(updates)
      }
    });

    return updatedUser;
  } catch (error) {
    logger.error('Error updating user', { 
      userId,
      updates,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    throw new AppError(500, 'Error updating user');
  }
}

export async function deactivateUser(userId: string): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    
    const command = new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { userId },
      UpdateExpression: 'SET isActive = :isActive, deactivatedAt = :timestamp, updatedAt = :timestamp',
      ConditionExpression: 'attribute_exists(userId)',
      ExpressionAttributeValues: {
        ':isActive': false,
        ':timestamp': timestamp
      }
    });

    await dynamoDB.send(command);
    
    // Clear cache entries
    const user = await findUserById(userId);
    userCache.del(`user:id:${userId}`);
    if (user?.email) userCache.del(`user:${user.email}`);
    
    logger.info('User deactivated successfully', { userId });

    await logUserActivity({
      userId,
      action: UserAction.ACCOUNT_DEACTIVATED,
      timestamp,
      details: {
        deactivatedAt: timestamp
      }
    });
  } catch (error) {
    logger.error('Error deactivating user', { 
      userId,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    throw new AppError(500, 'Error deactivating user');
  }
} 