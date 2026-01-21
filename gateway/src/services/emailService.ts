import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { loadTemplate } from '../utils/emailTemplateLoader.js';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

let transporter: Transporter | null = null;

/**
 * Initialize the nodemailer transporter
 */
const getTransporter = (): Transporter => {
  if (!transporter) {
    const emailConfig = config.email;

    if (!emailConfig.host) {
      logger.warn('Email service not configured - emails will be logged but not sent');
      // Create a transport that logs emails instead of sending
      transporter = nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
      });
      return transporter;
    }

    transporter = nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port,
      secure: emailConfig.secure,
      auth: emailConfig.user && emailConfig.pass ? {
        user: emailConfig.user,
        pass: emailConfig.pass,
      } : undefined,
    });

    logger.info('Email transporter initialized');
  }
  return transporter;
};

/**
 * Verify the email transporter connection
 */
const verifyConnection = async (): Promise<boolean> => {
  try {
    const transport = getTransporter();
    await transport.verify();
    logger.info('Email transporter connection verified');
    return true;
  } catch (error) {
    logger.error('Email transporter verification failed', error);
    return false;
  }
};

export const emailService = {
  /**
   * Send a generic email
   */
  sendEmail: async (to: string, subject: string, html: string, text?: string): Promise<SendResult> => {
    try {
      const transport = getTransporter();
      const emailConfig = config.email;

      const mailOptions: EmailOptions = {
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      };

      // If email is not configured, just log the email
      if (!emailConfig.host) {
        logger.info(`[EMAIL NOT SENT - No SMTP configured] To: ${to}, Subject: ${subject}`);
        return { success: true, messageId: 'not-sent-no-smtp' };
      }

      const info = await transport.sendMail({
        from: `"${emailConfig.fromName}" <${emailConfig.from}>`,
        ...mailOptions,
      });

      logger.info(`Email sent to ${to}: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to send email to ${to}`, error);
      return { success: false, error: errorMessage };
    }
  },

  /**
   * Send form submission notification email
   */
  sendFormSubmittedEmail: async (to: string, formTitle: string, formId: number): Promise<SendResult> => {
    const html = await loadTemplate('form-submitted', {
      formTitle,
      formId: formId.toString(),
      formLink: `${config.email.appUrl}/forms/${formId}`,
      year: new Date().getFullYear().toString(),
    });

    return emailService.sendEmail(
      to,
      `New Form Submission: ${formTitle}`,
      html
    );
  },

  /**
   * Send review decision notification email
   */
  sendReviewDecisionEmail: async (
    to: string,
    formTitle: string,
    decision: 'approved' | 'rejected' | 'changes_requested',
    notes?: string
  ): Promise<SendResult> => {
    const decisionLabels = {
      approved: 'Approved',
      rejected: 'Rejected',
      changes_requested: 'Changes Requested',
    };

    const html = await loadTemplate('review-decision', {
      formTitle,
      decision: decisionLabels[decision],
      decisionClass: decision === 'approved' ? 'success' : decision === 'rejected' ? 'error' : 'warning',
      notes: notes || 'No additional notes provided.',
      hasNotes: notes ? 'true' : '',
      year: new Date().getFullYear().toString(),
    });

    return emailService.sendEmail(
      to,
      `Form ${decisionLabels[decision]}: ${formTitle}`,
      html
    );
  },

  /**
   * Send task assignment notification email
   */
  sendTaskAssignedEmail: async (
    to: string,
    taskTitle: string,
    taskId: number,
    dueDate?: Date
  ): Promise<SendResult> => {
    const html = await loadTemplate('task-assigned', {
      taskTitle,
      taskId: taskId.toString(),
      taskLink: `${config.email.appUrl}/tasks/${taskId}`,
      dueDate: dueDate ? dueDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }) : '',
      hasDueDate: dueDate ? 'true' : '',
      year: new Date().getFullYear().toString(),
    });

    return emailService.sendEmail(
      to,
      `New Task Assigned: ${taskTitle}`,
      html
    );
  },

  /**
   * Send comment notification email
   */
  sendCommentNotificationEmail: async (
    to: string,
    formTitle: string,
    commenterName: string,
    comment: string
  ): Promise<SendResult> => {
    const html = await loadTemplate('comment-notification', {
      formTitle,
      commenterName,
      comment: comment.length > 500 ? comment.substring(0, 500) + '...' : comment,
      year: new Date().getFullYear().toString(),
    });

    return emailService.sendEmail(
      to,
      `New Comment on ${formTitle}`,
      html
    );
  },

  /**
   * Send mention notification email
   */
  sendMentionEmail: async (
    to: string,
    formTitle: string,
    mentionerName: string,
    comment: string
  ): Promise<SendResult> => {
    const html = await loadTemplate('comment-notification', {
      formTitle,
      commenterName: mentionerName,
      comment: comment.length > 500 ? comment.substring(0, 500) + '...' : comment,
      isMention: 'true',
      year: new Date().getFullYear().toString(),
    });

    return emailService.sendEmail(
      to,
      `${mentionerName} mentioned you in ${formTitle}`,
      html
    );
  },

  /**
   * Send password reset email
   */
  sendPasswordResetEmail: async (
    to: string,
    resetLink: string,
    expiresIn: string = '1 hour'
  ): Promise<SendResult> => {
    const html = await loadTemplate('password-reset', {
      resetLink,
      expiresIn,
      year: new Date().getFullYear().toString(),
    });

    return emailService.sendEmail(
      to,
      'Password Reset Request',
      html
    );
  },

  /**
   * Send welcome email to new users
   */
  sendWelcomeEmail: async (to: string, userName: string): Promise<SendResult> => {
    const html = await loadTemplate('welcome', {
      userName,
      loginLink: `${config.email.appUrl}/login`,
      year: new Date().getFullYear().toString(),
    });

    return emailService.sendEmail(
      to,
      'Welcome to Radiology Research Platform',
      html
    );
  },

  /**
   * Send account locked notification email
   */
  sendAccountLockedEmail: async (to: string, unlockTime: Date): Promise<SendResult> => {
    const html = await loadTemplate('base', {
      title: 'Account Security Alert',
      preheader: 'Your account has been temporarily locked',
      content: `
        <h2 style="color: #1f2937; font-size: 20px; font-weight: 600; margin-bottom: 16px;">
          Account Temporarily Locked
        </h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin-bottom: 16px;">
          Your account has been temporarily locked due to multiple failed login attempts.
          This is a security measure to protect your account.
        </p>
        <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin-bottom: 24px;">
          Your account will be automatically unlocked at:
          <strong>${unlockTime.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}</strong>
        </p>
        <p style="color: #6b7280; font-size: 14px; line-height: 22px;">
          If you did not attempt to log in, please contact the administrator immediately.
        </p>
      `,
      year: new Date().getFullYear().toString(),
    });

    return emailService.sendEmail(
      to,
      'Account Security Alert - Account Locked',
      html
    );
  },

  /**
   * Send deadline reminder email
   */
  sendDeadlineReminderEmail: async (
    to: string,
    formTitle: string,
    deadline: Date,
    daysUntil: number
  ): Promise<SendResult> => {
    const html = await loadTemplate('deadline-reminder', {
      formTitle,
      deadline: deadline.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      daysUntil: daysUntil.toString(),
      urgencyClass: daysUntil <= 1 ? 'urgent' : daysUntil <= 3 ? 'warning' : 'normal',
      year: new Date().getFullYear().toString(),
    });

    return emailService.sendEmail(
      to,
      `Deadline Reminder: ${formTitle} - ${daysUntil} day${daysUntil !== 1 ? 's' : ''} remaining`,
      html
    );
  },

  /**
   * Send task status change notification email
   */
  sendTaskStatusChangedEmail: async (
    to: string,
    taskTitle: string,
    projectTitle: string,
    status: 'submitted' | 'approved' | 'rejected' | 'revision_requested',
    taskId: number,
    reviewerComments?: string
  ): Promise<SendResult> => {
    const statusLabels: Record<string, string> = {
      submitted: 'Submitted for Review',
      approved: 'Approved',
      rejected: 'Rejected',
      revision_requested: 'Revision Requested',
    };

    const statusClasses: Record<string, string> = {
      submitted: 'info',
      approved: 'success',
      rejected: 'error',
      revision_requested: 'warning',
    };

    const html = await loadTemplate('task-status-changed', {
      taskTitle,
      projectTitle,
      taskId: taskId.toString(),
      taskLink: `${config.email.appUrl}/tasks/${taskId}`,
      status: statusLabels[status],
      statusClass: statusClasses[status],
      reviewerComments: reviewerComments || '',
      hasComments: reviewerComments ? 'true' : '',
      isSubmitted: status === 'submitted' ? 'true' : '',
      isApproved: status === 'approved' ? 'true' : '',
      isRejected: status === 'rejected' ? 'true' : '',
      isRevisionRequested: status === 'revision_requested' ? 'true' : '',
      year: new Date().getFullYear().toString(),
    });

    return emailService.sendEmail(
      to,
      `Task ${statusLabels[status]}: ${taskTitle}`,
      html
    );
  },

  /**
   * Send a test email
   */
  sendTestEmail: async (to: string): Promise<SendResult> => {
    const html = await loadTemplate('base', {
      title: 'Test Email',
      preheader: 'This is a test email from Radiology Research Platform',
      content: `
        <h2 style="color: #1f2937; font-size: 20px; font-weight: 600; margin-bottom: 16px;">
          Email Configuration Test
        </h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin-bottom: 16px;">
          This is a test email to verify that your email configuration is working correctly.
        </p>
        <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin-bottom: 24px;">
          If you received this email, your SMTP settings are configured properly.
        </p>
        <table border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
          <tr>
            <td style="background-color: #2563eb; border-radius: 6px; text-align: center;">
              <a href="${config.email.appUrl}" style="display: inline-block; padding: 12px 24px; color: #ffffff; text-decoration: none; font-weight: 500;">
                Go to Platform
              </a>
            </td>
          </tr>
        </table>
      `,
      year: new Date().getFullYear().toString(),
    });

    return emailService.sendEmail(
      to,
      'Test Email - Radiology Research Platform',
      html
    );
  },

  /**
   * Verify email configuration
   */
  verifyConnection,
};

export default emailService;
