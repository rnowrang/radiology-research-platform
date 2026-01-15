import helmet from 'helmet';
import cors from 'cors';
import { config } from '../config/index.js';

// Helmet security middleware configuration
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", config.cors.origin],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Allow loading external resources
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
});

// CORS configuration
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    const allowedOrigins = config.cors.origin.split(',').map((o) => o.trim());

    if (allowedOrigins.includes(origin) || config.env === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page', 'X-Limit'],
  maxAge: 86400, // 24 hours
});

// Sanitize request body to prevent NoSQL injection
export const sanitizeBody = (req: Express.Request, res: Express.Response, next: Express.NextFunction): void => {
  if (req.body) {
    sanitizeObject(req.body);
  }
  next();

  function sanitizeObject(obj: Record<string, unknown>): void {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // Remove keys starting with $ (MongoDB operators)
        if (key.startsWith('$')) {
          delete obj[key];
          continue;
        }

        const value = obj[key];

        if (typeof value === 'object' && value !== null) {
          sanitizeObject(value as Record<string, unknown>);
        }
      }
    }
  }
};
