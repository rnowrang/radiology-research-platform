import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AuthenticatedRequest } from '../types/index.js';
import { userQueries } from '../database/queries/userQueries.js';
import { sessionQueries } from '../database/queries/sessionQueries.js';
import { logAudit } from '../middleware/audit.js';
import { AUDIT_ACTIONS, USER_ROLES } from '../config/constants.js';
import { ValidationError, NotFoundError, ConflictError } from '../utils/errors.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

// Transform user object to camelCase for frontend
const toUserResponse = (user: any) => ({
  id: user.id,
  email: user.email,
  fullName: user.full_name,
  role: user.role,
  isActive: user.is_active,
  emailVerified: user.email_verified,
  lockedUntil: user.locked_until || null,
  failedLoginAttempts: user.failed_login_attempts || 0,
  createdAt: user.created_at,
  updatedAt: user.updated_at,
});

// Generate a random temporary password
const generateTempPassword = (): string => {
  return crypto.randomBytes(12).toString('base64').slice(0, 16);
};

export const userController = {
  // List all users with pagination and filters
  list: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const role = req.query.role as string | undefined;
      const is_active = req.query.is_active !== undefined
        ? req.query.is_active === 'true'
        : undefined;
      const search = req.query.search as string | undefined;

      const { users, total } = await userQueries.findAllUsers(
        { role, is_active, search },
        { page, limit }
      );

      res.json({
        success: true,
        data: users.map(toUserResponse),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get single user by ID
  get: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const user = await userQueries.findUserById(id);

      if (!user) {
        throw new NotFoundError('User');
      }

      res.json({
        success: true,
        data: toUserResponse(user),
      });
    } catch (error) {
      next(error);
    }
  },

  // Create new user (admin creates user with role)
  create: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password, full_name, role = 'researcher', is_active = true } = req.body;

      // Validate required fields
      if (!email || !password || !full_name) {
        throw new ValidationError('Missing required fields', {
          email: !email ? ['Email is required'] : [],
          password: !password ? ['Password is required'] : [],
          full_name: !full_name ? ['Full name is required'] : [],
        });
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new ValidationError('Invalid email format', {
          email: ['Please provide a valid email address'],
        });
      }

      // Validate role
      const validRoles = Object.values(USER_ROLES);
      if (role && !validRoles.includes(role)) {
        throw new ValidationError('Invalid role', {
          role: [`Role must be one of: ${validRoles.join(', ')}`],
        });
      }

      // Validate password strength
      if (password.length < config.security.passwordMinLength) {
        throw new ValidationError('Password too weak', {
          password: [`Password must be at least ${config.security.passwordMinLength} characters`],
        });
      }

      // Check if user already exists
      const existingUser = await userQueries.findByEmail(email);
      if (existingUser) {
        throw new ConflictError('A user with this email already exists');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);

      // Create user
      const user = await userQueries.createUser(email, passwordHash, full_name, role, is_active);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'user',
        resourceId: user.id,
        details: { email: user.email, role, createdBy: req.user?.id },
      });

      logger.info(`Admin created user: ${email} by ${req.user?.email}`);

      res.status(201).json({
        success: true,
        data: toUserResponse(user),
        message: 'User created successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  // Update user (name, role, active status)
  update: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { full_name, role, is_active } = req.body;

      // Check if user exists
      const existingUser = await userQueries.findUserById(id);
      if (!existingUser) {
        throw new NotFoundError('User');
      }

      // Validate role if provided
      if (role !== undefined) {
        const validRoles = Object.values(USER_ROLES);
        if (!validRoles.includes(role)) {
          throw new ValidationError('Invalid role', {
            role: [`Role must be one of: ${validRoles.join(', ')}`],
          });
        }
      }

      // Prevent self-demotion from admin
      if (req.user?.id === id && req.user?.role === USER_ROLES.ADMIN && role !== USER_ROLES.ADMIN) {
        throw new ValidationError('Cannot change your own admin role', {
          role: ['You cannot remove your own admin privileges'],
        });
      }

      // Update user
      const user = await userQueries.updateUser(id, { full_name, role, is_active });

      if (!user) {
        throw new NotFoundError('User');
      }

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'user',
        resourceId: id,
        details: { changes: { full_name, role, is_active }, updatedBy: req.user?.id },
      });

      logger.info(`Admin updated user: ${id} by ${req.user?.email}`);

      res.json({
        success: true,
        data: toUserResponse(user),
        message: 'User updated successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  // Deactivate user (soft delete)
  deactivate: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      // Check if user exists
      const existingUser = await userQueries.findUserById(id);
      if (!existingUser) {
        throw new NotFoundError('User');
      }

      // Prevent self-deactivation
      if (req.user?.id === id) {
        throw new ValidationError('Cannot deactivate yourself', {
          id: ['You cannot deactivate your own account'],
        });
      }

      // Deactivate user
      const user = await userQueries.deactivateUser(id);

      if (!user) {
        throw new NotFoundError('User');
      }

      // Revoke all user sessions
      await sessionQueries.revokeAllForUser(id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.DELETE,
        resourceType: 'user',
        resourceId: id,
        details: { email: existingUser.email, deactivatedBy: req.user?.id },
      });

      logger.info(`Admin deactivated user: ${id} by ${req.user?.email}`);

      res.json({
        success: true,
        data: toUserResponse(user),
        message: 'User deactivated successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  // Admin reset password (generate temp password)
  resetPassword: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      // Check if user exists
      const existingUser = await userQueries.findUserById(id);
      if (!existingUser) {
        throw new NotFoundError('User');
      }

      // Generate temporary password
      const tempPassword = generateTempPassword();

      // Hash and save password
      const passwordHash = await bcrypt.hash(tempPassword, config.security.bcryptRounds);
      await userQueries.resetUserPassword(id, passwordHash);

      // Revoke all user sessions so they have to log in with new password
      await sessionQueries.revokeAllForUser(id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.PASSWORD_RESET,
        resourceType: 'user',
        resourceId: id,
        details: { email: existingUser.email, resetBy: req.user?.id },
      });

      logger.info(`Admin reset password for user: ${id} by ${req.user?.email}`);

      res.json({
        success: true,
        data: {
          tempPassword,
          userId: id,
          email: existingUser.email,
        },
        message: 'Password reset successfully. Please provide the temporary password to the user.',
      });
    } catch (error) {
      next(error);
    }
  },

  // Unlock locked account
  unlock: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      // Check if user exists
      const existingUser = await userQueries.findUserById(id);
      if (!existingUser) {
        throw new NotFoundError('User');
      }

      // Unlock user
      await userQueries.unlockUser(id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'user',
        resourceId: id,
        details: { action: 'unlock', email: existingUser.email, unlockedBy: req.user?.id },
      });

      logger.info(`Admin unlocked user: ${id} by ${req.user?.email}`);

      res.json({
        success: true,
        message: 'User account unlocked successfully',
      });
    } catch (error) {
      next(error);
    }
  },
};

export default userController;
