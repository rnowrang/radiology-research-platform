import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { userQueries } from '../database/queries/userQueries.js';
import { sessionQueries } from '../database/queries/sessionQueries.js';
import { User, TokenPayload, Session } from '../types/index.js';
import { UnauthorizedError, ValidationError, ConflictError, NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface AuthResult {
  user: User;
  accessToken: string;
  refreshToken: string;
  session: Session;
}

export const authService = {
  register: async (
    email: string,
    password: string,
    fullName: string,
    role: string = 'researcher'
  ): Promise<User> => {
    // Check if user exists
    const existingUser = await userQueries.findByEmail(email);
    if (existingUser) {
      throw new ConflictError('A user with this email already exists');
    }

    // Validate password strength
    if (password.length < config.security.passwordMinLength) {
      throw new ValidationError('Password too weak', {
        password: [`Password must be at least ${config.security.passwordMinLength} characters`],
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, config.security.bcryptRounds);

    // Create user
    const user = await userQueries.create(email, passwordHash, fullName, role);

    logger.info(`User registered: ${email}`);

    return user;
  },

  login: async (
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthResult> => {
    // Find user
    const user = await userQueries.findByEmail(email);

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Check if account is locked
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remainingMinutes = Math.ceil(
        (new Date(user.locked_until).getTime() - Date.now()) / 60000
      );
      throw new UnauthorizedError(
        `Account is locked. Try again in ${remainingMinutes} minutes.`
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      // Increment failed attempts
      const attempts = await userQueries.incrementFailedLoginAttempts(user.id);

      if (attempts >= config.security.maxLoginAttempts) {
        const lockedUntil = new Date(Date.now() + config.security.lockoutDuration);
        await userQueries.lockAccount(user.id, lockedUntil);
        logger.warn(`Account locked due to failed attempts: ${email}`);
        throw new UnauthorizedError('Account locked due to too many failed attempts');
      }

      throw new UnauthorizedError('Invalid email or password');
    }

    // Check if account is active
    if (!user.is_active) {
      throw new UnauthorizedError('Account is deactivated');
    }

    // Reset failed login attempts
    await userQueries.resetLoginAttempts(user.id);

    // Update last login
    await userQueries.updateLastLogin(user.id);

    // Create session
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const session = await sessionQueries.create(user.id, expiresAt, ipAddress, userAgent);

    // Generate tokens
    const accessToken = authService.generateAccessToken(user, session.id);
    const refreshToken = session.refresh_token;

    logger.info(`User logged in: ${email}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        is_active: user.is_active,
        email_verified: user.email_verified,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
      accessToken,
      refreshToken,
      session,
    };
  },

  logout: async (sessionId: string): Promise<void> => {
    await sessionQueries.revoke(sessionId);
    logger.info(`Session revoked: ${sessionId}`);
  },

  logoutAllSessions: async (userId: string): Promise<number> => {
    const count = await sessionQueries.revokeAllForUser(userId);
    logger.info(`All sessions revoked for user: ${userId}`);
    return count;
  },

  refreshAccessToken: async (refreshToken: string): Promise<{ accessToken: string; session: Session }> => {
    const session = await sessionQueries.findByRefreshToken(refreshToken);

    if (!session) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const user = await userQueries.findById(session.user_id);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (!user.is_active) {
      throw new UnauthorizedError('Account is deactivated');
    }

    // Extend session
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const extendedSession = await sessionQueries.extend(session.id, newExpiresAt);

    if (!extendedSession) {
      throw new UnauthorizedError('Failed to extend session');
    }

    // Generate new access token
    const accessToken = authService.generateAccessToken(user, session.id);

    return { accessToken, session: extendedSession };
  },

  generateAccessToken: (user: User, sessionId: string): string => {
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      sessionId,
    };

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });
  },

  changePassword: async (userId: string, currentPassword: string, newPassword: string): Promise<void> => {
    const user = await userQueries.findByEmail(
      (await userQueries.findById(userId))?.email || ''
    );

    if (!user) {
      throw new NotFoundError('User');
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    // Validate new password
    if (newPassword.length < config.security.passwordMinLength) {
      throw new ValidationError('Password too weak', {
        password: [`Password must be at least ${config.security.passwordMinLength} characters`],
      });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);

    // Update password
    await userQueries.updatePassword(userId, passwordHash);

    // Revoke all sessions except current
    await sessionQueries.revokeAllForUser(userId);

    logger.info(`Password changed for user: ${userId}`);
  },

  requestPasswordReset: async (email: string): Promise<string> => {
    const user = await userQueries.findByEmail(email);

    if (!user) {
      // Don't reveal if user exists
      return 'If an account with this email exists, a password reset link has been sent.';
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user.id, type: 'password_reset' },
      config.jwt.secret,
      { expiresIn: '1h' }
    );

    // Save reset token
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await userQueries.setPasswordResetToken(user.id, resetToken, expires);

    logger.info(`Password reset requested for: ${email}`);

    // In production, send email here
    // For now, return token (in production, don't return this!)
    return resetToken;
  },

  resetPassword: async (token: string, newPassword: string): Promise<void> => {
    // Verify token
    let decoded: { userId: string; type: string };
    try {
      decoded = jwt.verify(token, config.jwt.secret) as typeof decoded;
    } catch {
      throw new UnauthorizedError('Invalid or expired reset token');
    }

    if (decoded.type !== 'password_reset') {
      throw new UnauthorizedError('Invalid token type');
    }

    const user = await userQueries.findByPasswordResetToken(token);

    if (!user) {
      throw new UnauthorizedError('Invalid or expired reset token');
    }

    // Validate new password
    if (newPassword.length < config.security.passwordMinLength) {
      throw new ValidationError('Password too weak', {
        password: [`Password must be at least ${config.security.passwordMinLength} characters`],
      });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);

    // Update password and clear reset token
    await userQueries.updatePassword(user.id, passwordHash);
    await userQueries.clearPasswordResetToken(user.id);

    // Revoke all sessions
    await sessionQueries.revokeAllForUser(user.id);

    logger.info(`Password reset completed for: ${user.email}`);
  },
};

export default authService;
