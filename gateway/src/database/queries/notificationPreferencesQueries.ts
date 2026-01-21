import { query, transaction } from '../connection.js';

export interface NotificationPreference {
  id: number;
  user_id: string;
  notification_type: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UpdatePreferenceData {
  notification_type: string;
  in_app_enabled: boolean;
  email_enabled: boolean;
}

// All supported notification types
export const NOTIFICATION_TYPES = [
  'approval_request',
  'status_change',
  'comment',
  'task_assigned',
  'mention',
  'reminder',
] as const;

export type NotificationType = typeof NOTIFICATION_TYPES[number];

// Human-readable labels for notification types
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  approval_request: 'Approval Requests',
  status_change: 'Status Changes',
  comment: 'Comments',
  task_assigned: 'Task Assignments',
  mention: 'Mentions',
  reminder: 'Reminders',
};

// Descriptions for notification types
export const NOTIFICATION_TYPE_DESCRIPTIONS: Record<NotificationType, string> = {
  approval_request: 'When someone requests your approval on a form or project',
  status_change: 'When a form or task you\'re involved in changes status',
  comment: 'When someone comments on your forms or projects',
  task_assigned: 'When a task is assigned to you',
  mention: 'When someone mentions you in a comment',
  reminder: 'Deadline and follow-up reminders',
};

export const notificationPreferencesQueries = {
  /**
   * Get all notification preferences for a user
   * Returns preferences for all notification types, creating defaults if they don't exist
   */
  getPreferences: async (userId: string): Promise<NotificationPreference[]> => {
    // First, ensure all preference types exist for this user
    await notificationPreferencesQueries.ensureDefaultPreferences(userId);

    const result = await query<NotificationPreference>(
      `SELECT id, user_id, notification_type, in_app_enabled, email_enabled, created_at, updated_at
       FROM notification_preferences
       WHERE user_id = $1
       ORDER BY notification_type`,
      [userId]
    );

    return result.rows;
  },

  /**
   * Get a single preference for a specific notification type
   */
  getPreferenceByType: async (
    userId: string,
    notificationType: string
  ): Promise<NotificationPreference | null> => {
    const result = await query<NotificationPreference>(
      `SELECT id, user_id, notification_type, in_app_enabled, email_enabled, created_at, updated_at
       FROM notification_preferences
       WHERE user_id = $1 AND notification_type = $2`,
      [userId, notificationType]
    );

    return result.rows[0] || null;
  },

  /**
   * Update a single preference
   */
  updatePreference: async (
    userId: string,
    notificationType: string,
    inAppEnabled: boolean,
    emailEnabled: boolean
  ): Promise<NotificationPreference> => {
    const result = await query<NotificationPreference>(
      `INSERT INTO notification_preferences (user_id, notification_type, in_app_enabled, email_enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, notification_type)
       DO UPDATE SET
         in_app_enabled = EXCLUDED.in_app_enabled,
         email_enabled = EXCLUDED.email_enabled,
         updated_at = NOW()
       RETURNING *`,
      [userId, notificationType, inAppEnabled, emailEnabled]
    );

    return result.rows[0];
  },

  /**
   * Update multiple preferences at once
   */
  updatePreferences: async (
    userId: string,
    preferences: UpdatePreferenceData[]
  ): Promise<NotificationPreference[]> => {
    if (preferences.length === 0) return [];

    return transaction(async (client) => {
      const results: NotificationPreference[] = [];

      for (const pref of preferences) {
        const result = await client.query<NotificationPreference>(
          `INSERT INTO notification_preferences (user_id, notification_type, in_app_enabled, email_enabled)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, notification_type)
           DO UPDATE SET
             in_app_enabled = EXCLUDED.in_app_enabled,
             email_enabled = EXCLUDED.email_enabled,
             updated_at = NOW()
           RETURNING *`,
          [userId, pref.notification_type, pref.in_app_enabled, pref.email_enabled]
        );

        if (result.rows[0]) {
          results.push(result.rows[0]);
        }
      }

      return results;
    });
  },

  /**
   * Ensure default preferences exist for a user
   * Creates any missing preference entries with defaults (all enabled)
   */
  ensureDefaultPreferences: async (userId: string): Promise<void> => {
    const values: unknown[] = [];
    const placeholders: string[] = [];

    NOTIFICATION_TYPES.forEach((type, index) => {
      const offset = index * 4;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`);
      values.push(userId, type, true, true);
    });

    await query(
      `INSERT INTO notification_preferences (user_id, notification_type, in_app_enabled, email_enabled)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (user_id, notification_type) DO NOTHING`,
      values
    );
  },

  /**
   * Check if a user has in-app notifications enabled for a type
   */
  isInAppEnabled: async (userId: string, notificationType: string): Promise<boolean> => {
    const result = await query<{ in_app_enabled: boolean }>(
      `SELECT in_app_enabled
       FROM notification_preferences
       WHERE user_id = $1 AND notification_type = $2`,
      [userId, notificationType]
    );

    // Default to true if no preference exists
    return result.rows[0]?.in_app_enabled ?? true;
  },

  /**
   * Check if a user has email notifications enabled for a type
   */
  isEmailEnabled: async (userId: string, notificationType: string): Promise<boolean> => {
    const result = await query<{ email_enabled: boolean }>(
      `SELECT email_enabled
       FROM notification_preferences
       WHERE user_id = $1 AND notification_type = $2`,
      [userId, notificationType]
    );

    // Default to true if no preference exists
    return result.rows[0]?.email_enabled ?? true;
  },

  /**
   * Check both in-app and email preferences for a user and notification type
   * Returns an object with both boolean values
   */
  getEnabledStatus: async (
    userId: string,
    notificationType: string
  ): Promise<{ inAppEnabled: boolean; emailEnabled: boolean }> => {
    const result = await query<{ in_app_enabled: boolean; email_enabled: boolean }>(
      `SELECT in_app_enabled, email_enabled
       FROM notification_preferences
       WHERE user_id = $1 AND notification_type = $2`,
      [userId, notificationType]
    );

    // Default to true for both if no preference exists
    return {
      inAppEnabled: result.rows[0]?.in_app_enabled ?? true,
      emailEnabled: result.rows[0]?.email_enabled ?? true,
    };
  },

  /**
   * Bulk check preferences for multiple users (useful for batch notifications)
   * Returns a map of userId -> { inAppEnabled, emailEnabled }
   */
  getEnabledStatusForUsers: async (
    userIds: string[],
    notificationType: string
  ): Promise<Map<string, { inAppEnabled: boolean; emailEnabled: boolean }>> => {
    if (userIds.length === 0) {
      return new Map();
    }

    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(', ');

    const result = await query<{
      user_id: string;
      in_app_enabled: boolean;
      email_enabled: boolean;
    }>(
      `SELECT user_id, in_app_enabled, email_enabled
       FROM notification_preferences
       WHERE user_id IN (${placeholders}) AND notification_type = $${userIds.length + 1}`,
      [...userIds, notificationType]
    );

    const preferencesMap = new Map<string, { inAppEnabled: boolean; emailEnabled: boolean }>();

    // Initialize all users with defaults (true for both)
    for (const userId of userIds) {
      preferencesMap.set(userId, { inAppEnabled: true, emailEnabled: true });
    }

    // Override with actual preferences
    for (const row of result.rows) {
      preferencesMap.set(row.user_id, {
        inAppEnabled: row.in_app_enabled,
        emailEnabled: row.email_enabled,
      });
    }

    return preferencesMap;
  },

  /**
   * Get default preferences (all enabled)
   */
  getDefaultPreferences: (): {
    types: readonly string[];
    labels: Record<string, string>;
    descriptions: Record<string, string>;
    defaults: { in_app_enabled: boolean; email_enabled: boolean };
  } => {
    return {
      types: NOTIFICATION_TYPES,
      labels: NOTIFICATION_TYPE_LABELS,
      descriptions: NOTIFICATION_TYPE_DESCRIPTIONS,
      defaults: {
        in_app_enabled: true,
        email_enabled: true,
      },
    };
  },
};

export default notificationPreferencesQueries;
