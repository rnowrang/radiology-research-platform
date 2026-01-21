import { notificationQueries, CreateNotificationData } from '../database/queries/notificationQueries.js';
import { notificationPreferencesQueries } from '../database/queries/notificationPreferencesQueries.js';
import { userQueries } from '../database/queries/userQueries.js';
import { logger } from '../utils/logger.js';
import { Notification } from '../types/index.js';
import { emailService } from './emailService.js';

export type NotificationType =
  | 'approval_request'
  | 'status_change'
  | 'comment'
  | 'task_assigned'
  | 'mention'
  | 'reminder';

export type TaskStatusChangeType = 'submitted' | 'approved' | 'rejected' | 'revision_requested';

export const notificationService = {
  /**
   * Create a single notification (with preference check)
   */
  createNotification: async (
    userId: string,
    type: NotificationType,
    title: string,
    message?: string,
    link?: string
  ): Promise<Notification | null> => {
    try {
      // Check user's in-app notification preference
      const isInAppEnabled = await notificationPreferencesQueries.isInAppEnabled(userId, type);

      if (!isInAppEnabled) {
        logger.debug(`Skipping in-app notification for user ${userId}: ${type} notifications disabled`);
        return null;
      }

      const notification = await notificationQueries.create({
        user_id: userId,
        type,
        title,
        message,
        link,
      });
      logger.info(`Created notification for user ${userId}: ${title}`);
      return notification;
    } catch (error) {
      logger.error('Failed to create notification', error);
      throw error;
    }
  },

  /**
   * Notify reviewers when a form is submitted for review
   */
  notifyFormSubmitted: async (
    formId: number,
    formTitle: string,
    submitterName: string,
    reviewerIds: string[]
  ): Promise<Notification[]> => {
    if (reviewerIds.length === 0) return [];

    const notificationType: NotificationType = 'approval_request';

    // Get preferences for all users at once
    const preferencesMap = await notificationPreferencesQueries.getEnabledStatusForUsers(
      reviewerIds,
      notificationType
    );

    // Filter users who have in-app notifications enabled
    const inAppEnabledUsers = reviewerIds.filter(
      (id) => preferencesMap.get(id)?.inAppEnabled ?? true
    );

    const notifications: CreateNotificationData[] = inAppEnabledUsers.map((reviewerId) => ({
      user_id: reviewerId,
      type: notificationType,
      title: 'New form submission for review',
      message: `${submitterName} submitted "${formTitle}" for review`,
      link: `/forms/${formId}`,
    }));

    try {
      const created = notifications.length > 0
        ? await notificationQueries.createMany(notifications)
        : [];

      logger.info(`Notified ${inAppEnabledUsers.length} of ${reviewerIds.length} reviewers about form ${formId} submission (in-app)`);

      // Send email notifications only to users with email notifications enabled
      const emailEnabledUsers = reviewerIds.filter(
        (id) => preferencesMap.get(id)?.emailEnabled ?? true
      );

      for (const reviewerId of emailEnabledUsers) {
        notificationService.sendEmailToUser(reviewerId, async (email) => {
          await emailService.sendFormSubmittedEmail(email, formTitle, formId);
        }).catch((err) => logger.warn('Failed to send form submitted email', err));
      }

      logger.info(`Sent email notifications to ${emailEnabledUsers.length} of ${reviewerIds.length} reviewers`);

      return created;
    } catch (error) {
      logger.error('Failed to notify reviewers about form submission', error);
      throw error;
    }
  },

  /**
   * Notify form owner about review decision
   */
  notifyReviewDecision: async (
    formId: number,
    formTitle: string,
    ownerId: string,
    decision: 'approved' | 'rejected' | 'changes_requested',
    reviewerName?: string,
    notes?: string
  ): Promise<Notification | null> => {
    const notificationType: NotificationType = 'status_change';

    const decisionMessages = {
      approved: {
        title: 'Form approved',
        message: `Your form "${formTitle}" has been approved${reviewerName ? ` by ${reviewerName}` : ''}`,
      },
      rejected: {
        title: 'Form rejected',
        message: `Your form "${formTitle}" has been rejected${reviewerName ? ` by ${reviewerName}` : ''}. Please review the feedback.`,
      },
      changes_requested: {
        title: 'Changes requested',
        message: `Changes have been requested on "${formTitle}"${reviewerName ? ` by ${reviewerName}` : ''}. Please review and update.`,
      },
    };

    const { title, message } = decisionMessages[decision];

    // Get user preferences
    const preferences = await notificationPreferencesQueries.getEnabledStatus(ownerId, notificationType);

    try {
      let notification: Notification | null = null;

      // Create in-app notification if enabled
      if (preferences.inAppEnabled) {
        notification = await notificationQueries.create({
          user_id: ownerId,
          type: notificationType,
          title,
          message,
          link: `/forms/${formId}`,
        });
        logger.info(`Notified owner ${ownerId} about ${decision} decision on form ${formId}`);
      } else {
        logger.debug(`Skipping in-app notification for owner ${ownerId}: status_change notifications disabled`);
      }

      // Send email notification if enabled
      if (preferences.emailEnabled) {
        notificationService.sendEmailToUser(ownerId, async (email) => {
          await emailService.sendReviewDecisionEmail(email, formTitle, decision, notes);
        }).catch((err) => logger.warn('Failed to send review decision email', err));
      }

      return notification;
    } catch (error) {
      logger.error('Failed to notify owner about review decision', error);
      throw error;
    }
  },

  /**
   * Notify users when a comment is added to a form
   */
  notifyCommentAdded: async (
    formId: number,
    formTitle: string,
    commenterName: string,
    userIds: string[],
    comment?: string
  ): Promise<Notification[]> => {
    if (userIds.length === 0) return [];

    const notificationType: NotificationType = 'comment';

    // Get preferences for all users at once
    const preferencesMap = await notificationPreferencesQueries.getEnabledStatusForUsers(
      userIds,
      notificationType
    );

    // Filter users who have in-app notifications enabled
    const inAppEnabledUsers = userIds.filter(
      (id) => preferencesMap.get(id)?.inAppEnabled ?? true
    );

    const notifications: CreateNotificationData[] = inAppEnabledUsers.map((userId) => ({
      user_id: userId,
      type: notificationType,
      title: 'New comment on form',
      message: `${commenterName} commented on "${formTitle}"`,
      link: `/forms/${formId}`,
    }));

    try {
      const created = notifications.length > 0
        ? await notificationQueries.createMany(notifications)
        : [];

      logger.info(`Notified ${inAppEnabledUsers.length} of ${userIds.length} users about new comment on form ${formId} (in-app)`);

      // Send email notifications only to users with email notifications enabled
      if (comment) {
        const emailEnabledUsers = userIds.filter(
          (id) => preferencesMap.get(id)?.emailEnabled ?? true
        );

        for (const userId of emailEnabledUsers) {
          notificationService.sendEmailToUser(userId, async (email) => {
            await emailService.sendCommentNotificationEmail(email, formTitle, commenterName, comment);
          }).catch((err) => logger.warn('Failed to send comment notification email', err));
        }

        logger.info(`Sent email notifications to ${emailEnabledUsers.length} of ${userIds.length} users`);
      }

      return created;
    } catch (error) {
      logger.error('Failed to notify users about comment', error);
      throw error;
    }
  },

  /**
   * Notify user when a task is assigned to them
   */
  notifyTaskAssigned: async (
    taskId: number,
    taskTitle: string,
    userId: string,
    assignerName?: string,
    dueDate?: Date
  ): Promise<Notification | null> => {
    const notificationType: NotificationType = 'task_assigned';

    // Get user preferences
    const preferences = await notificationPreferencesQueries.getEnabledStatus(userId, notificationType);

    try {
      let notification: Notification | null = null;

      // Create in-app notification if enabled
      if (preferences.inAppEnabled) {
        notification = await notificationQueries.create({
          user_id: userId,
          type: notificationType,
          title: 'New task assigned',
          message: `You have been assigned "${taskTitle}"${assignerName ? ` by ${assignerName}` : ''}`,
          link: `/tasks/${taskId}`,
        });
        logger.info(`Notified user ${userId} about task ${taskId} assignment`);
      } else {
        logger.debug(`Skipping in-app notification for user ${userId}: task_assigned notifications disabled`);
      }

      // Send email notification if enabled
      if (preferences.emailEnabled) {
        notificationService.sendEmailToUser(userId, async (email) => {
          await emailService.sendTaskAssignedEmail(email, taskTitle, taskId, dueDate);
        }).catch((err) => logger.warn('Failed to send task assigned email', err));
      }

      return notification;
    } catch (error) {
      logger.error('Failed to notify user about task assignment', error);
      throw error;
    }
  },

  /**
   * Notify user when mentioned in a comment
   */
  notifyMention: async (
    formId: number,
    formTitle: string,
    mentionedUserId: string,
    mentionerName: string,
    comment?: string
  ): Promise<Notification | null> => {
    const notificationType: NotificationType = 'mention';

    // Get user preferences
    const preferences = await notificationPreferencesQueries.getEnabledStatus(mentionedUserId, notificationType);

    try {
      let notification: Notification | null = null;

      // Create in-app notification if enabled
      if (preferences.inAppEnabled) {
        notification = await notificationQueries.create({
          user_id: mentionedUserId,
          type: notificationType,
          title: 'You were mentioned',
          message: `${mentionerName} mentioned you in a comment on "${formTitle}"`,
          link: `/forms/${formId}`,
        });
        logger.info(`Notified user ${mentionedUserId} about mention on form ${formId}`);
      } else {
        logger.debug(`Skipping in-app notification for user ${mentionedUserId}: mention notifications disabled`);
      }

      // Send email notification if enabled
      if (preferences.emailEnabled && comment) {
        notificationService.sendEmailToUser(mentionedUserId, async (email) => {
          await emailService.sendMentionEmail(email, formTitle, mentionerName, comment);
        }).catch((err) => logger.warn('Failed to send mention email', err));
      }

      return notification;
    } catch (error) {
      logger.error('Failed to notify user about mention', error);
      throw error;
    }
  },

  /**
   * Notify multiple users when mentioned in a comment
   */
  notifyMentions: async (
    formId: number,
    formTitle: string,
    mentionedUsers: Array<{ id: string; name?: string; email?: string }>,
    mentionerName: string,
    comment?: string
  ): Promise<Notification[]> => {
    if (mentionedUsers.length === 0) return [];

    const notificationType: NotificationType = 'mention';
    const userIds = mentionedUsers.map((u) => u.id);

    // Get preferences for all users at once
    const preferencesMap = await notificationPreferencesQueries.getEnabledStatusForUsers(
      userIds,
      notificationType
    );

    // Filter users who have in-app notifications enabled
    const inAppEnabledUsers = mentionedUsers.filter(
      (user) => preferencesMap.get(user.id)?.inAppEnabled ?? true
    );

    const notifications: CreateNotificationData[] = inAppEnabledUsers.map((user) => ({
      user_id: user.id,
      type: notificationType,
      title: 'You were mentioned',
      message: `${mentionerName} mentioned you in a comment on "${formTitle}"`,
      link: `/forms/${formId}`,
    }));

    try {
      const created = notifications.length > 0
        ? await notificationQueries.createMany(notifications)
        : [];

      logger.info(`Notified ${inAppEnabledUsers.length} of ${mentionedUsers.length} users about mentions on form ${formId} (in-app)`);

      // Send email notifications to users with emails and email notifications enabled
      if (comment) {
        const emailEnabledUsers = mentionedUsers.filter(
          (user) => preferencesMap.get(user.id)?.emailEnabled ?? true
        );

        for (const user of emailEnabledUsers) {
          if (user.email) {
            emailService.sendMentionEmail(user.email, formTitle, mentionerName, comment)
              .catch((err) => logger.warn(`Failed to send mention email to ${user.email}`, err));
          } else {
            notificationService.sendEmailToUser(user.id, async (email) => {
              await emailService.sendMentionEmail(email, formTitle, mentionerName, comment);
            }).catch((err) => logger.warn('Failed to send mention email', err));
          }
        }

        logger.info(`Sent email notifications to ${emailEnabledUsers.length} of ${mentionedUsers.length} users`);
      }

      return created;
    } catch (error) {
      logger.error('Failed to notify users about mentions', error);
      throw error;
    }
  },

  /**
   * Send a deadline reminder notification
   */
  notifyDeadlineReminder: async (
    userId: string,
    itemType: 'form' | 'task',
    itemId: number,
    itemTitle: string,
    dueDate: Date
  ): Promise<Notification | null> => {
    const notificationType: NotificationType = 'reminder';
    const link = itemType === 'form' ? `/forms/${itemId}` : `/tasks/${itemId}`;
    const formattedDate = dueDate.toLocaleDateString();

    // Get user preferences
    const preferences = await notificationPreferencesQueries.getEnabledStatus(userId, notificationType);

    try {
      let notification: Notification | null = null;

      // Create in-app notification if enabled
      if (preferences.inAppEnabled) {
        notification = await notificationQueries.create({
          user_id: userId,
          type: notificationType,
          title: 'Upcoming deadline',
          message: `"${itemTitle}" is due on ${formattedDate}`,
          link,
        });
        logger.info(`Sent deadline reminder to user ${userId} for ${itemType} ${itemId}`);
      } else {
        logger.debug(`Skipping in-app notification for user ${userId}: reminder notifications disabled`);
      }

      // Send email notification for form deadlines if enabled
      if (preferences.emailEnabled && itemType === 'form') {
        const now = new Date();
        const daysUntil = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        notificationService.sendEmailToUser(userId, async (email) => {
          await emailService.sendDeadlineReminderEmail(email, itemTitle, dueDate, daysUntil);
        }).catch((err) => logger.warn('Failed to send deadline reminder email', err));
      }

      return notification;
    } catch (error) {
      logger.error('Failed to send deadline reminder', error);
      throw error;
    }
  },

  /**
   * Helper function to send email to a user by their ID
   * Fetches user email and executes the callback with the email
   */
  sendEmailToUser: async (
    userId: string,
    emailCallback: (email: string) => Promise<void>
  ): Promise<void> => {
    try {
      const user = await userQueries.findById(userId);
      if (user && user.email) {
        await emailCallback(user.email);
      } else {
        logger.warn(`Could not find email for user ${userId}`);
      }
    } catch (error) {
      logger.error(`Failed to send email to user ${userId}`, error);
      throw error;
    }
  },

  /**
   * Notify users when a task status changes
   * Used for submit, approve, reject, and request-revision actions
   */
  notifyTaskStatusChanged: async (
    taskId: number,
    taskTitle: string,
    projectTitle: string,
    newStatus: TaskStatusChangeType,
    changedByUserId: string,
    notifyUserIds: string[],
    reviewerComments?: string
  ): Promise<Notification[]> => {
    if (notifyUserIds.length === 0) return [];

    const statusMessages: Record<TaskStatusChangeType, { title: string; message: string; notificationType: NotificationType }> = {
      submitted: {
        title: 'Task submitted for review',
        message: `Task "${taskTitle}" in project "${projectTitle}" has been submitted for review`,
        notificationType: 'approval_request',
      },
      approved: {
        title: 'Task approved',
        message: `Your task "${taskTitle}" in project "${projectTitle}" has been approved`,
        notificationType: 'status_change',
      },
      rejected: {
        title: 'Task rejected',
        message: `Your task "${taskTitle}" in project "${projectTitle}" has been rejected. Please review the feedback.`,
        notificationType: 'status_change',
      },
      revision_requested: {
        title: 'Task revision requested',
        message: `Revisions have been requested for "${taskTitle}" in project "${projectTitle}". Please review and update.`,
        notificationType: 'status_change',
      },
    };

    const { title, message, notificationType } = statusMessages[newStatus];

    // Get preferences for all users at once
    const preferencesMap = await notificationPreferencesQueries.getEnabledStatusForUsers(
      notifyUserIds,
      notificationType
    );

    // Filter users who have in-app notifications enabled
    const inAppEnabledUsers = notifyUserIds.filter(
      (id) => preferencesMap.get(id)?.inAppEnabled ?? true
    );

    const notifications: CreateNotificationData[] = inAppEnabledUsers.map((userId) => ({
      user_id: userId,
      type: notificationType,
      title,
      message,
      link: `/tasks/${taskId}`,
    }));

    try {
      const created = notifications.length > 0
        ? await notificationQueries.createMany(notifications)
        : [];

      logger.info(`Notified ${inAppEnabledUsers.length} of ${notifyUserIds.length} users about task ${taskId} status change to ${newStatus} by user ${changedByUserId} (in-app)`);

      // Send email notifications only to users with email notifications enabled
      const emailEnabledUsers = notifyUserIds.filter(
        (id) => preferencesMap.get(id)?.emailEnabled ?? true
      );

      for (const userId of emailEnabledUsers) {
        notificationService.sendEmailToUser(userId, async (email) => {
          await emailService.sendTaskStatusChangedEmail(
            email,
            taskTitle,
            projectTitle,
            newStatus,
            taskId,
            reviewerComments
          );
        }).catch((err) => logger.warn(`Failed to send task status change email to user ${userId}`, err));
      }

      logger.info(`Sent email notifications to ${emailEnabledUsers.length} of ${notifyUserIds.length} users`);

      return created;
    } catch (error) {
      logger.error('Failed to notify users about task status change', error);
      throw error;
    }
  },
};

export default notificationService;
