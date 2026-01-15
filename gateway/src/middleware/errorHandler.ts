import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  // Log the error
  logger.error(err.stack || err.message);

  // Handle AppError (operational errors)
  if (err instanceof AppError) {
    const response: {
      success: boolean;
      error: string;
      errors?: Record<string, string[]>;
      stack?: string;
    } = {
      success: false,
      error: err.message,
    };

    // Include validation errors if present
    if (err instanceof ValidationError) {
      response.errors = err.errors;
    }

    // Include stack trace in development
    if (config.env === 'development') {
      response.stack = err.stack;
    }

    res.status(err.statusCode).json(response);
    return;
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    });
    return;
  }

  // Handle PostgreSQL errors
  if ('code' in err && typeof err.code === 'string') {
    const pgError = err as Error & { code: string; detail?: string; constraint?: string };

    switch (pgError.code) {
      case '23505': // Unique violation
        res.status(409).json({
          success: false,
          error: 'A record with this value already exists',
        });
        return;

      case '23503': // Foreign key violation
        res.status(400).json({
          success: false,
          error: 'Referenced record does not exist',
        });
        return;

      case '23502': // Not null violation
        res.status(400).json({
          success: false,
          error: 'Required field is missing',
        });
        return;

      case '22P02': // Invalid text representation
        res.status(400).json({
          success: false,
          error: 'Invalid data format',
        });
        return;
    }
  }

  // Handle unknown errors (non-operational)
  const response: {
    success: boolean;
    error: string;
    stack?: string;
  } = {
    success: false,
    error: config.env === 'production' ? 'Internal server error' : err.message,
  };

  if (config.env === 'development') {
    response.stack = err.stack;
  }

  res.status(500).json(response);
};

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.path}`,
  });
};

// Async handler wrapper to catch promise rejections
export const asyncHandler = <T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
