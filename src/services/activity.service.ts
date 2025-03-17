import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { logger } from '../config/logger';
import { AppError } from '../utils/AppError';
import { UserActivityLog, UserAction } from '../interfaces/user.interface';
import dynamoDB from '../config/dynamodb';

const TABLE_NAME = process.env.USER_ACTIVITY_TABLE || 'user_activities';

export async function logUserActivity(activity: Omit<UserActivityLog, 'timestamp'> & { timestamp?: string }): Promise<void> {
  try {
    const timestamp = activity.timestamp || new Date().toISOString();
    const activityLog: UserActivityLog = {
      ...activity,
      timestamp
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: activityLog
    });

    await dynamoDB.send(command);
    
    logger.debug('Activity logged successfully', { 
      userId: activity.userId,
      action: activity.action
    });
  } catch (error) {
    logger.error('Error logging user activity', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      activity 
    });
    throw new AppError(500, 'Error logging user activity');
  }
}

export async function getUserActivities(
  userId: string,
  options: {
    startDate?: string;
    endDate?: string;
    limit?: number;
    actions?: UserAction[];
  } = {}
): Promise<UserActivityLog[]> {
  try {
    const { startDate, endDate, limit = 50, actions } = options;

    let filterExpression = 'userId = :userId';
    const expressionAttributeValues: Record<string, any> = {
      ':userId': userId
    };

    if (startDate) {
      filterExpression += ' AND #ts >= :startDate';
      expressionAttributeValues[':startDate'] = startDate;
    }

    if (endDate) {
      filterExpression += ' AND #ts <= :endDate';
      expressionAttributeValues[':endDate'] = endDate;
    }

    if (actions && actions.length > 0) {
      filterExpression += ' AND #action IN (:actions)';
      expressionAttributeValues[':actions'] = actions;
    }

    const command = new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: filterExpression,
      ExpressionAttributeNames: {
        '#ts': 'timestamp',
        '#action': 'action'
      },
      ExpressionAttributeValues: expressionAttributeValues,
      Limit: limit
    });

    const result = await dynamoDB.send(command);
    
    if (!result.Items) {
      return [];
    }

    const activities = result.Items as UserActivityLog[];
    activities.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    logger.debug('User activities retrieved successfully', { 
      userId,
      count: activities.length
    });

    return activities;
  } catch (error) {
    logger.error('Error retrieving user activities', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId 
    });
    throw new AppError(500, 'Error retrieving user activities');
  }
}

export async function getSecurityEvents(
  userId: string,
  options: {
    startDate?: string;
    endDate?: string;
    limit?: number;
  } = {}
): Promise<UserActivityLog[]> {
  const securityActions = [
    UserAction.LOGIN_SUCCESS,
    UserAction.LOGIN_FAILED,
    UserAction.PASSWORD_CHANGED,
    UserAction.PASSWORD_RESET,
    UserAction.TWO_FACTOR_ENABLED,
    UserAction.TWO_FACTOR_DISABLED,
    UserAction.DEVICE_ADDED,
    UserAction.DEVICE_REMOVED
  ];

  return getUserActivities(userId, {
    ...options,
    actions: securityActions
  });
} 