import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { UserRole, USER_ROLES } from '../config/constants.js';

export const requireRole = (...roles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!roles.includes(req.user.role as UserRole)) {
      return next(new ForbiddenError(`This action requires one of the following roles: ${roles.join(', ')}`));
    }

    next();
  };
};

export const requireAdmin = requireRole(USER_ROLES.ADMIN);

export const requireReviewer = requireRole(USER_ROLES.ADMIN, USER_ROLES.REVIEWER);

export const requireResearcher = requireRole(USER_ROLES.ADMIN, USER_ROLES.REVIEWER, USER_ROLES.RESEARCHER);

export const isAdmin = (req: AuthenticatedRequest): boolean => {
  return req.user?.role === USER_ROLES.ADMIN;
};

export const isReviewer = (req: AuthenticatedRequest): boolean => {
  return req.user?.role === USER_ROLES.ADMIN || req.user?.role === USER_ROLES.REVIEWER;
};

export const isResearcher = (req: AuthenticatedRequest): boolean => {
  return !!req.user;
};

export const requireOwnerOrAdmin = (getOwnerId: (req: AuthenticatedRequest) => string | Promise<string>) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (req.user.role === USER_ROLES.ADMIN) {
      return next();
    }

    try {
      const ownerId = await getOwnerId(req);

      if (ownerId !== req.user.id) {
        return next(new ForbiddenError('You do not have permission to access this resource'));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
