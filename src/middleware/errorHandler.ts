import { Request, Response, NextFunction } from 'express';
import { logger, logAPIError } from '../config/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  if (err instanceof AppError) {
    logAPIError(err, req, {
      statusCode: err.statusCode,
      isOperational: err.isOperational
    });

    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      requestId: req.headers['x-request-id']
    });
  }

  // Unexpected errors
  logAPIError(err, req, {
    statusCode: 500,
    isOperational: false
  });

  // Only send error details in development
  const message = process.env.NODE_ENV === 'development' 
    ? err.message 
    : 'Internal server error';

  return res.status(500).json({
    status: 'error',
    message,
    requestId: req.headers['x-request-id']
  });
}; 