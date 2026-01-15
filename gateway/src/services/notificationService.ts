import { notificationQueries, CreateNotificationData } from '../database/queries/notificationQueries.js';
import { userQueries } from '../database/queries/userQueries.js';
import { logger } from '../utils/logger.js';
import { Notification } from '../types/index.js';
import { emailService } from './emailService.js';
import { config } from '../config/index.js';

export type NotificationType =
  | 'approval_request'
  | 'status_change'
  | 'comment'
  | 'task_assigned'
  | 'mention'
  | 'reminder';

export const notificationService = {
  /**
   * Create a single notification
   */
  createNotification: async (
    userId: string,
    type: NotificationType,
    title: string,
    message?: string,
    link?: string
  ): Promise<Notification> => {
    try {
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

    const notifications: CreateNotificationData[] = reviewerIds.map((reviewerId) => ({
      user_id: reviewerId,
      type: 'approval_request',
      title: 'New form submission for review',
      message: `${submitterName} submitted "${formTitle}" for review`,
      link: `/forms/${formId}`,
    }));

    try {
      const created = await notificationQueries.createMany(notifications);
      logger.info(`Notified ${reviewerIds.length} reviewers about form ${formId} submission`);

      // Send email notifications (async, don't block)
      for (const reviewerId of reviewerIds) {
        notificationService.sendEmailToUser(reviewerId, async (email) => {
          await emailService.sendFormSubmittedEmail(email, formTitle, formId);
        }).catch((err) => logger.warn('Failed to send form submitted email', err));
      }

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
  ): Promise<Notification> => {
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

    try {
      const notification = await notificationQueries.create({
        user_id: ownerId,
        type: 'status_change',
        title,
        message,
        link: `/forms/${formId}`,
      });
      logger.info(`Notified owner ${ownerId} about ${decision} decision on form ${formId}`);

      // Send email notification (async, don't block)
      notificationService.sendEmailToUser(ownerId, async (email) => {
        await emailService.sendReviewDecisionEmail(email, formTitle, decision, notes);
      }).catch((err) => logger.warn('Failed to send review decision email', err));

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

    const notifications: CreateNotificationData[] = userIds.map((userId) => ({
      user_id: userId,
      type: 'comment',
      title: 'New comment on form',
      message: `${commenterName} commented on "${formTitle}"`,
      link: `/forms/${formId}`,
    }));

    try {
      const created = await notificationQueries.createMany(notifications);
      logger.info(`Notified ${userIds.length} users about new comment on form ${formId}`);

      // Send email notifications (async, don't block)
      if (comment) {
        for (const userId of userIds) {
          notificationService.sendEmailToUser(userId, async (email) => {
            await emailService.sendCommentNotificationEmail(email, formTitle, commenterName, comment);
          }).catch((err) => logger.warn('Failed to send comment notification email', err));
        }
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
  ): Promise<Notification> => {
    try {
      const notification = await notificationQueries.create({
        user_id: userId,
        type: 'task_assigned',
        title: 'New task assigned',
        message: `You have been assigned "${taskTitle}"${assignerName ? ` by ${assignerName}` : ''}`,
        link: `/tasks/${taskId}`,
      });
      logger.info(`Notified user ${userId} about task ${taskId} assignment`);

      // Send email notification (async, don't block)
      notificationService.sendEmailToUser(userId, async (email) => {
        await emailService.sendTaskAssignedEmail(email, taskTitle, taskId, dueDate);
      }).catch((err) => logger.warn('Failed to send task assigned email', err));

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
  ): Promise<Notification> => {
    try {
      const notification = await notificationQueries.create({
        user_id: mentionedUserId,
        type: 'mention',
        title: 'You were mentioned',
        message: `${mentionerName} mentioned you in a comment on "${formTitle}"`,
        link: `/forms/${formId}`,
      });
      logger.info(`Notified user ${mentionedUserId} about mention on form ${formId}`);

      // Send email notification (async, don't block)
      if (comment) {
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

    const notifications: CreateNotificationData[] = mentionedUsers.map((user) => ({
      user_id: user.id,
      type: 'mention',
      title: 'You were mentioned',
      message: `${mentionerName} mentioned you in a comment on "${formTitle}"`,
      link: `/forms/${formId}`,
    }));

    try {
      const created = await notificationQueries.createMany(notifications);
      logger.info(`Notified ${mentionedUsers.length} users about mentions on form ${formId}`);

      // Send email notifications to users with emails (async, don't block)
      if (comment) {
        for (const user of mentionedUsers) {
          if (user.email) {
            emailService.sendMentionEmail(user.email, formTitle, mentionerName, comment)
              .catch((err) => logger.warn(`Failed to send mention email to ${user.email}`, err));
          } else {
            notificationService.sendEmailToUser(user.id, async (email) => {
              await emailService.sendMentionEmail(email, formTitle, mentionerName, comment);
            }).catch((err) => logger.warn('Failed to send mention email', err));
          }
        }
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
  ): Promise<Notification> => {
    const link = itemType === 'form' ? `/forms/${itemId}` : `/tasks/${itemId}`;
    const formattedDate = dueDate.toLocaleDateString();

    try {
      const notification = await notificationQueries.create({
        user_id: userId,
        type: 'reminder',
        title: 'Upcoming deadline',
        message: `"${itemTitle}" is due on ${formattedDate}`,
        link,
      });
      logger.info(`Sent deadline reminder to user ${userId} for ${itemType} ${itemId}`);

      // Send email notification for form deadlines (async, don't block)
      if (itemType === 'form') {
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
};

export default notificationService;
