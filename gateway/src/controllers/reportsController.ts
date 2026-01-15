import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { reportQueries } from '../database/queries/reportQueries.js';
import { reportService } from '../services/reportService.js';
import { ValidationError } from '../utils/errors.js';

export const reportsController = {
  // GET /api/admin/reports/overview
  getOverview: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const report = await reportService.generateOverviewReport();

      res.json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/admin/reports/projects-by-type
  getProjectsByType: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const data = await reportQueries.getProjectsByType();

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/admin/reports/projects-by-status
  getProjectsByStatus: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const data = await reportQueries.getProjectsByStatus();
      const formattedData = reportService.formatStatusLabels(data);

      res.json({
        success: true,
        data: formattedData,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/admin/reports/forms-by-status
  getFormsByStatus: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const data = await reportQueries.getFormsByStatus();
      const formattedData = reportService.formatStatusLabels(data);

      res.json({
        success: true,
        data: formattedData,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/admin/reports/forms-by-template
  getFormsByTemplate: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const data = await reportQueries.getFormsByTemplate();

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/admin/reports/tasks-by-status
  getTasksByStatus: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const data = await reportQueries.getTasksByStatus();
      const formattedData = reportService.formatStatusLabels(data);

      res.json({
        success: true,
        data: formattedData,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/admin/reports/tasks-by-priority
  getTasksByPriority: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const data = await reportQueries.getTasksByPriority();
      const formattedData = reportService.formatPriorityLabels(data);

      res.json({
        success: true,
        data: formattedData,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/admin/reports/activity-trends
  getActivityTrends: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { start_date, end_date, interval = 'day' } = req.query;

      // Default to last 30 days if no dates provided
      const endDate = end_date ? new Date(end_date as string) : new Date();
      const startDate = start_date
        ? new Date(start_date as string)
        : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new ValidationError('Invalid date format');
      }

      if (startDate > endDate) {
        throw new ValidationError('Start date must be before end date');
      }

      // Validate interval
      const validIntervals = ['day', 'week', 'month'];
      if (!validIntervals.includes(interval as string)) {
        throw new ValidationError('Invalid interval. Must be day, week, or month');
      }

      const data = await reportQueries.getActivityTrends(
        startDate,
        endDate,
        interval as 'day' | 'week' | 'month'
      );

      res.json({
        success: true,
        data,
        meta: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          interval,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/admin/reports/top-researchers
  getTopResearchers: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;

      if (limit < 1 || limit > 100) {
        throw new ValidationError('Limit must be between 1 and 100');
      }

      const data = await reportQueries.getTopResearchers(limit);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/admin/reports/department-stats
  getDepartmentStats: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const data = await reportQueries.getDepartmentStats();

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/admin/reports/review-metrics
  getReviewMetrics: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const data = await reportQueries.getReviewMetrics();

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/admin/reports/monthly-submissions
  getMonthlySubmissions: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const months = parseInt(req.query.months as string) || 12;

      if (months < 1 || months > 36) {
        throw new ValidationError('Months must be between 1 and 36');
      }

      const data = await reportQueries.getMonthlySubmissions(months);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /api/admin/reports/users-by-role
  getUsersByRole: async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const data = await reportQueries.getUsersByRole();
      const formattedData = reportService.formatRoleLabels(data);

      res.json({
        success: true,
        data: formattedData,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default reportsController;
