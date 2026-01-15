import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { config } from '../config/index.js';
import { emailService } from '../services/emailService.js';
import { logAudit } from '../middleware/audit.js';
import { AUDIT_ACTIONS } from '../config/constants.js';
import { ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const emailController = {
  /**
   * Get current email configuration (without sensitive data)
   * GET /api/admin/email/config
   */
  getConfig: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const emailConfig = config.email;

      res.json({
        success: true,
        data: {
          host: emailConfig.host || 'Not configured',
          port: emailConfig.port,
          secure: emailConfig.secure,
          user: emailConfig.user ? `${emailConfig.user.substring(0, 3)}***` : 'Not configured',
          hasPassword: !!emailConfig.pass,
          from: emailConfig.from,
          fromName: emailConfig.fromName,
          appUrl: emailConfig.appUrl,
          isConfigured: !!(emailConfig.host && emailConfig.user && emailConfig.pass),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Send a test email
   * POST /api/admin/email/test
   */
  testEmail: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email } = req.body;

      // Validate email
      if (!email) {
        throw new ValidationError('Email address is required', {
          email: ['Please provide an email address to send the test to'],
        });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new ValidationError('Invalid email format', {
          email: ['Please provide a valid email address'],
        });
      }

      // Send test email
      const result = await emailService.sendTestEmail(email);

      // Log the action
      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'email',
        resourceId: 'test',
        details: {
          recipient: email,
          success: result.success,
          messageId: result.messageId,
          error: result.error,
          sentBy: req.user?.id,
        },
      });

      if (result.success) {
        logger.info(`Test email sent to ${email} by admin ${req.user?.email}`);
        res.json({
          success: true,
          message: `Test email sent successfully to ${email}`,
          data: {
            messageId: result.messageId,
          },
        });
      } else {
        logger.warn(`Failed to send test email to ${email}: ${result.error}`);
        res.status(500).json({
          success: false,
          message: 'Failed to send test email',
          error: result.error,
        });
      }
    } catch (error) {
      next(error);
    }
  },

  /**
   * Verify email connection
   * POST /api/admin/email/verify
   */
  verifyConnection: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const isConnected = await emailService.verifyConnection();

      await logAudit(req, {
        action: AUDIT_ACTIONS.READ,
        resourceType: 'email',
        resourceId: 'verify',
        details: {
          success: isConnected,
          verifiedBy: req.user?.id,
        },
      });

      if (isConnected) {
        res.json({
          success: true,
          message: 'Email server connection verified successfully',
          data: {
            connected: true,
          },
        });
      } else {
        res.status(503).json({
          success: false,
          message: 'Failed to connect to email server',
          data: {
            connected: false,
          },
        });
      }
    } catch (error) {
      next(error);
    }
  },
};

export default emailController;
