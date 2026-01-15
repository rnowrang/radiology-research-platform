import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { activityService, ActivityType } from '../services/activityService.js';
import { ActivityFilters } from '../database/queries/activityQueries.js';
import { projectQueries } from '../database/queries/projectQueries.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import { USER_ROLES } from '../config/constants.js';

/**
 * Get global activity feed (admin only)
 * GET /api/activity
 */
export const getGlobalActivity = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const filters: ActivityFilters = {};

    if (req.query.action) {
      filters.action = req.query.action as string;
    }

    if (req.query.resource_type) {
      filters.resource_type = req.query.resource_type as string;
    }

    if (req.query.start_date) {
      filters.start_date = new Date(req.query.start_date as string);
    }

    if (req.query.end_date) {
      filters.end_date = new Date(req.query.end_date as string);
    }

    const result = await activityService.getActivityFeed(
      'global',
      null,
      { page, limit },
      filters
    );

    res.json({
      success: true,
      data: result.activities,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get project activity feed
 * GET /api/projects/:id/activity
 */
export const getProjectActivity = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id: projectId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // Check if project exists and user has access
    const project = await projectQueries.findById(projectId);
    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Check access: user must be PI, collaborator, or admin
    const collaborators = await projectQueries.getCollaborators(projectId);
    const isPI = project.principal_investigator_id === req.user!.id;
    const isCollaborator = collaborators.some(c => c.user_id === req.user!.id);
    const isAdmin = req.user!.role === USER_ROLES.ADMIN;

    if (!isPI && !isCollaborator && !isAdmin) {
      throw new ForbiddenError('You do not have access to this project');
    }

    const filters: ActivityFilters = {};

    if (req.query.action) {
      filters.action = req.query.action as string;
    }

    if (req.query.resource_type) {
      filters.resource_type = req.query.resource_type as string;
    }

    if (req.query.start_date) {
      filters.start_date = new Date(req.query.start_date as string);
    }

    if (req.query.end_date) {
      filters.end_date = new Date(req.query.end_date as string);
    }

    const result = await activityService.getActivityFeed(
      'project',
      projectId,
      { page, limit },
      filters
    );

    res.json({
      success: true,
      data: result.activities,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get form activity feed
 * GET /api/forms/:id/activity
 */
export const getFormActivity = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id: formId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // Note: Form access check should be handled by the forms proxy or middleware
    // For now, we'll allow authenticated users to view activity if they can view the form

    const filters: ActivityFilters = {};

    if (req.query.action) {
      filters.action = req.query.action as string;
    }

    if (req.query.start_date) {
      filters.start_date = new Date(req.query.start_date as string);
    }

    if (req.query.end_date) {
      filters.end_date = new Date(req.query.end_date as string);
    }

    const result = await activityService.getActivityFeed(
      'form',
      parseInt(formId, 10),
      { page, limit },
      filters
    );

    res.json({
      success: true,
      data: result.activities,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user activity feed
 * GET /api/users/:id/activity
 */
export const getUserActivity = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id: userId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // Check access: must be self or admin
    const isSelf = userId === req.user!.id;
    const isAdmin = req.user!.role === USER_ROLES.ADMIN;

    if (!isSelf && !isAdmin) {
      throw new ForbiddenError('You can only view your own activity');
    }

    const filters: ActivityFilters = {};

    if (req.query.action) {
      filters.action = req.query.action as string;
    }

    if (req.query.resource_type) {
      filters.resource_type = req.query.resource_type as string;
    }

    if (req.query.start_date) {
      filters.start_date = new Date(req.query.start_date as string);
    }

    if (req.query.end_date) {
      filters.end_date = new Date(req.query.end_date as string);
    }

    const result = await activityService.getActivityFeed(
      'user',
      userId,
      { page, limit },
      filters
    );

    res.json({
      success: true,
      data: result.activities,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user's own activity feed
 * GET /api/activity/me
 */
export const getMyActivity = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const filters: ActivityFilters = {};

    if (req.query.action) {
      filters.action = req.query.action as string;
    }

    if (req.query.resource_type) {
      filters.resource_type = req.query.resource_type as string;
    }

    if (req.query.start_date) {
      filters.start_date = new Date(req.query.start_date as string);
    }

    if (req.query.end_date) {
      filters.end_date = new Date(req.query.end_date as string);
    }

    const result = await activityService.getActivityFeed(
      'user',
      req.user!.id,
      { page, limit },
      filters
    );

    res.json({
      success: true,
      data: result.activities,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const activityController = {
  getGlobalActivity,
  getProjectActivity,
  getFormActivity,
  getUserActivity,
  getMyActivity,
};

export default activityController;
