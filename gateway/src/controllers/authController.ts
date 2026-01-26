import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { authService } from '../services/authService.js';
import { userQueries } from '../database/queries/userQueries.js';
import { logAudit } from '../middleware/audit.js';
import { AUDIT_ACTIONS } from '../config/constants.js';
import { ValidationError } from '../utils/errors.js';

// Transform user object to camelCase for frontend
const toUserResponse = (user: any) => ({
  id: user.id,
  email: user.email,
  fullName: user.full_name,
  role: user.role,
  isActive: user.is_active,
  emailVerified: user.email_verified,
  createdAt: user.created_at,
  updatedAt: user.updated_at,
});

export const authController = {
  register: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, full_name } = req.body;

      if (!email || !password || !full_name) {
        throw new ValidationError('Missing required fields', {
          email: !email ? ['Email is required'] : [],
          password: !password ? ['Password is required'] : [],
          full_name: !full_name ? ['Full name is required'] : [],
        });
      }

      const user = await authService.register(email, password, full_name);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'user',
        resourceId: user.id,
        details: { email: user.email },
      });

      res.status(201).json({
        success: true,
        data: { user: toUserResponse(user) },
        message: 'Registration successful',
      });
    } catch (error) {
      next(error);
    }
  },

  login: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        throw new ValidationError('Missing credentials', {
          email: !email ? ['Email is required'] : [],
          password: !password ? ['Password is required'] : [],
        });
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await authService.login(email, password, ipAddress, userAgent);

      // Set cookies
      res.cookie('access_token', result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000, // 15 minutes
      });

      res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Set req.user so audit log captures the user ID
      req.user = result.user;
      req.sessionId = result.session.id;

      await logAudit(req, {
        action: AUDIT_ACTIONS.LOGIN,
        resourceType: 'session',
        resourceId: result.session.id,
        details: { email: result.user.email },
      });

      res.json({
        success: true,
        data: {
          user: toUserResponse(result.user),
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        },
      });
    } catch (error) {
      await logAudit(req, {
        action: AUDIT_ACTIONS.LOGIN_FAILED,
        resourceType: 'auth',
        details: { email: req.body?.email },
      }, false);
      next(error);
    }
  },

  logout: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.sessionId) {
        await authService.logout(req.sessionId);

        await logAudit(req, {
          action: AUDIT_ACTIONS.LOGOUT,
          resourceType: 'session',
          resourceId: req.sessionId,
        });
      }

      // Clear cookies
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');

      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  refresh: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const refreshToken = req.cookies?.refresh_token || req.body?.refresh_token;

      if (!refreshToken) {
        throw new ValidationError('Refresh token required');
      }

      const result = await authService.refreshAccessToken(refreshToken);

      res.cookie('access_token', result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000,
      });

      res.json({
        success: true,
        data: {
          accessToken: result.accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  me: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({
        success: true,
        data: toUserResponse(req.user),
      });
    } catch (error) {
      next(error);
    }
  },

  changePassword: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { current_password, new_password } = req.body;

      if (!current_password || !new_password) {
        throw new ValidationError('Missing required fields', {
          current_password: !current_password ? ['Current password is required'] : [],
          new_password: !new_password ? ['New password is required'] : [],
        });
      }

      await authService.changePassword(req.user!.id, current_password, new_password);

      await logAudit(req, {
        action: AUDIT_ACTIONS.PASSWORD_CHANGE,
        resourceType: 'user',
        resourceId: req.user!.id,
      });

      res.json({
        success: true,
        message: 'Password changed successfully. Please log in again.',
      });
    } catch (error) {
      next(error);
    }
  },

  forgotPassword: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body;

      if (!email) {
        throw new ValidationError('Email is required');
      }

      const result = await authService.requestPasswordReset(email);

      await logAudit(req, {
        action: AUDIT_ACTIONS.PASSWORD_RESET,
        resourceType: 'user',
        details: { email },
      });

      res.json({
        success: true,
        message: result,
        // In development, return the token (NEVER do this in production)
        ...(process.env.NODE_ENV === 'development' && { reset_token: result }),
      });
    } catch (error) {
      next(error);
    }
  },

  resetPassword: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token, new_password } = req.body;

      if (!token || !new_password) {
        throw new ValidationError('Missing required fields', {
          token: !token ? ['Reset token is required'] : [],
          new_password: !new_password ? ['New password is required'] : [],
        });
      }

      await authService.resetPassword(token, new_password);

      await logAudit(req, {
        action: AUDIT_ACTIONS.PASSWORD_RESET,
        resourceType: 'user',
        details: { completed: true },
      });

      res.json({
        success: true,
        message: 'Password reset successfully. Please log in with your new password.',
      });
    } catch (error) {
      next(error);
    }
  },
};

export default authController;
