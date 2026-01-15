import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { notificationQueries } from '../database/queries/notificationQueries.js';
import { NotFoundError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const notificationController = {
  /**
   * Get notifications for authenticated user (paginated)
   */
  list: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);

      const result = await notificationQueries.findByUserId(userId, { page, limit });

      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Mark a single notification as read
   */
  markAsRead: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const notificationId = parseInt(req.params.id, 10);

      const notification = await notificationQueries.markAsRead(notificationId, userId);

      if (!notification) {
        throw new NotFoundError('Notification');
      }

      logger.info(`User ${userId} marked notification ${notificationId} as read`);

      res.json({
        success: true,
        data: notification,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Mark all notifications as read for authenticated user
   */
  markAllAsRead: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;

      const count = await notificationQueries.markAllAsRead(userId);

      logger.info(`User ${userId} marked ${count} notifications as read`);

      res.json({
        success: true,
        data: { count },
        message: `${count} notification${count === 1 ? '' : 's'} marked as read`,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete a notification
   */
  delete: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const notificationId = parseInt(req.params.id, 10);

      const deleted = await notificationQueries.delete(notificationId, userId);

      if (!deleted) {
        throw new NotFoundError('Notification');
      }

      logger.info(`User ${userId} deleted notification ${notificationId}`);

      res.json({
        success: true,
        message: 'Notification deleted',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get unread notification count for badge
   */
  getUnreadCount: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;

      const count = await notificationQueries.countUnread(userId);

      res.json({
        success: true,
        data: { count },
      });
    } catch (error) {
      next(error);
    }
  },
};

export default notificationController;
