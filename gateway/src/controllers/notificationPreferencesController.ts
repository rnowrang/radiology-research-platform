import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import {
  notificationPreferencesQueries,
  NOTIFICATION_TYPES,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPE_DESCRIPTIONS,
  NotificationType,
} from '../database/queries/notificationPreferencesQueries.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

// Transform preference to camelCase for frontend
const toPreferenceResponse = (pref: {
  id: number;
  user_id: string;
  notification_type: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}) => ({
  id: pref.id,
  userId: pref.user_id,
  notificationType: pref.notification_type,
  inAppEnabled: pref.in_app_enabled,
  emailEnabled: pref.email_enabled,
  label: NOTIFICATION_TYPE_LABELS[pref.notification_type as NotificationType] || pref.notification_type,
  description: NOTIFICATION_TYPE_DESCRIPTIONS[pref.notification_type as NotificationType] || '',
  createdAt: pref.created_at,
  updatedAt: pref.updated_at,
});

export const notificationPreferencesController = {
  /**
   * Get all notification preferences for the authenticated user
   * GET /api/users/me/notification-preferences
   */
  list: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;

      const preferences = await notificationPreferencesQueries.getPreferences(userId);

      res.json({
        success: true,
        data: {
          preferences: preferences.map(toPreferenceResponse),
          types: NOTIFICATION_TYPES,
          labels: NOTIFICATION_TYPE_LABELS,
          descriptions: NOTIFICATION_TYPE_DESCRIPTIONS,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update a single notification preference
   * PUT /api/users/me/notification-preferences/:type
   */
  update: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { type } = req.params;
      const { inAppEnabled, emailEnabled } = req.body;

      // Validate notification type
      if (!NOTIFICATION_TYPES.includes(type as NotificationType)) {
        throw new ValidationError('Invalid notification type', {
          type: [`Must be one of: ${NOTIFICATION_TYPES.join(', ')}`],
        });
      }

      // Validate boolean fields
      if (typeof inAppEnabled !== 'boolean' && typeof emailEnabled !== 'boolean') {
        throw new ValidationError('At least one preference must be specified', {
          inAppEnabled: ['Must be a boolean'],
          emailEnabled: ['Must be a boolean'],
        });
      }

      // Get current preference to merge with updates
      const currentPref = await notificationPreferencesQueries.getPreferenceByType(userId, type);
      const inApp = typeof inAppEnabled === 'boolean' ? inAppEnabled : (currentPref?.in_app_enabled ?? true);
      const email = typeof emailEnabled === 'boolean' ? emailEnabled : (currentPref?.email_enabled ?? true);

      const preference = await notificationPreferencesQueries.updatePreference(
        userId,
        type,
        inApp,
        email
      );

      logger.info(`User ${userId} updated notification preference for ${type}: inApp=${inApp}, email=${email}`);

      res.json({
        success: true,
        data: toPreferenceResponse(preference),
        message: 'Notification preference updated successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update multiple notification preferences at once
   * PUT /api/users/me/notification-preferences
   */
  updateAll: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { preferences } = req.body;

      // Validate preferences array
      if (!Array.isArray(preferences)) {
        throw new ValidationError('Invalid request body', {
          preferences: ['Must be an array of preference objects'],
        });
      }

      // Validate each preference
      const validPreferences: Array<{
        notification_type: string;
        in_app_enabled: boolean;
        email_enabled: boolean;
      }> = [];

      for (const pref of preferences) {
        if (!pref.notificationType || typeof pref.notificationType !== 'string') {
          throw new ValidationError('Invalid preference', {
            notificationType: ['Each preference must have a notificationType'],
          });
        }

        if (!NOTIFICATION_TYPES.includes(pref.notificationType as NotificationType)) {
          throw new ValidationError('Invalid notification type', {
            notificationType: [`"${pref.notificationType}" is not a valid type. Must be one of: ${NOTIFICATION_TYPES.join(', ')}`],
          });
        }

        if (typeof pref.inAppEnabled !== 'boolean' || typeof pref.emailEnabled !== 'boolean') {
          throw new ValidationError('Invalid preference values', {
            inAppEnabled: ['Must be a boolean'],
            emailEnabled: ['Must be a boolean'],
          });
        }

        validPreferences.push({
          notification_type: pref.notificationType,
          in_app_enabled: pref.inAppEnabled,
          email_enabled: pref.emailEnabled,
        });
      }

      const updatedPreferences = await notificationPreferencesQueries.updatePreferences(
        userId,
        validPreferences
      );

      logger.info(`User ${userId} updated ${updatedPreferences.length} notification preferences`);

      res.json({
        success: true,
        data: updatedPreferences.map(toPreferenceResponse),
        message: `${updatedPreferences.length} notification preference(s) updated successfully`,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get default/available notification types (for reference)
   * GET /api/users/me/notification-preferences/types
   */
  getTypes: async (_req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const defaults = notificationPreferencesQueries.getDefaultPreferences();

      res.json({
        success: true,
        data: defaults,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default notificationPreferencesController;
