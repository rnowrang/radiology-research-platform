import express, { Application } from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import morgan from 'morgan';
import { helmetMiddleware, corsMiddleware, sanitizeBody } from './middleware/security.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

export const createApp = (): Application => {
  const app = express();

  // Trust proxy (for rate limiting, IP detection behind nginx)
  app.set('trust proxy', 1);

  // Security middleware
  app.use(helmetMiddleware);
  app.use(corsMiddleware);

  // Request parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Sanitize request body
  app.use(sanitizeBody);

  // Compression
  app.use(compression());

  // Request logging
  if (config.env === 'development') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined', {
      stream: {
        write: (message: string) => logger.info(message.trim()),
      },
    }));
  }

  // Rate limiting
  app.use('/api', apiLimiter);

  // API routes
  app.use('/api', routes);

  // Error handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export default createApp;
