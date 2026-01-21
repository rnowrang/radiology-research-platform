import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { formsProxy } from '../services/formsProxy.js';
import { fileService } from '../services/fileService.js';
import { logAudit } from '../middleware/audit.js';
import { AUDIT_ACTIONS, USER_ROLES } from '../config/constants.js';
import { ValidationError, ForbiddenError } from '../utils/errors.js';
import { notificationService } from '../services/notificationService.js';
import { userQueries } from '../database/queries/userQueries.js';
import { projectQueries } from '../database/queries/projectQueries.js';
import { logger } from '../utils/logger.js';

export const taskController = {
  list: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const response = await formsProxy.getTasks(req.user!.id, req.query as Record<string, unknown>);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  get: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const taskId = parseInt(req.params.id);
      const response = await formsProxy.getTask(taskId, req.user!.id);
      const taskData = response.data;

      // Enrich task data with user names and project/form titles
      const enrichedTask = { ...taskData };

      // Get assigned user name
      if (taskData.assigned_to_id) {
        try {
          const assignedUser = await userQueries.findById(taskData.assigned_to_id);
          if (assignedUser) {
            enrichedTask.assigned_to_name = assignedUser.full_name;
          }
        } catch (err) {
          logger.warn('Failed to get assigned user name', err);
        }
      }

      // Get created by user name
      if (taskData.created_by_id) {
        try {
          const createdByUser = await userQueries.findById(taskData.created_by_id);
          if (createdByUser) {
            enrichedTask.created_by_name = createdByUser.full_name;
          }
        } catch (err) {
          logger.warn('Failed to get created by user name', err);
        }
      }

      // Get reviewed by user name
      if (taskData.reviewed_by_id) {
        try {
          const reviewedByUser = await userQueries.findById(taskData.reviewed_by_id);
          if (reviewedByUser) {
            enrichedTask.reviewed_by_name = reviewedByUser.full_name;
          }
        } catch (err) {
          logger.warn('Failed to get reviewed by user name', err);
        }
      }

      // Get project title
      if (taskData.project_id) {
        try {
          const project = await projectQueries.findById(taskData.project_id);
          if (project) {
            enrichedTask.project_title = project.title;
          }
        } catch (err) {
          logger.warn('Failed to get project title', err);
        }
      }

      // Get form title (from forms service response which already includes it)
      // If not present, we could fetch it, but the forms service should provide it
      if (taskData.form_instance_id && !taskData.form_title) {
        try {
          const formResponse = await formsProxy.getForm(taskData.form_instance_id, req.user!.id);
          if (formResponse.data?.title) {
            enrichedTask.form_title = formResponse.data.title;
          }
        } catch (err) {
          logger.warn('Failed to get form title', err);
        }
      }

      res.json({ success: true, data: enrichedTask });
    } catch (error) {
      next(error);
    }
  },

  create: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title } = req.body;

      if (!title) {
        throw new ValidationError('Title is required');
      }

      const response = await formsProxy.createTask(req.body, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'task',
        resourceId: response.data.data?.id?.toString(),
        details: { title },
      });

      res.status(201).json(response.data);
    } catch (error) {
      next(error);
    }
  },

  update: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const taskId = parseInt(req.params.id);
      const response = await formsProxy.updateTask(taskId, req.body, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'task',
        resourceId: req.params.id,
        details: { fields: Object.keys(req.body) },
      });

      res.json(response.data);
    } catch (error) {
      next(error);
    }
  },

  delete: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const taskId = parseInt(req.params.id);

      // First, get the task to check its status
      const taskResponse = await formsProxy.getTask(taskId, req.user!.id);
      const task = taskResponse.data?.data || taskResponse.data;

      // Prevent deletion of approved or completed tasks
      if (task.status === 'approved' || task.status === 'completed') {
        throw new ValidationError(`Cannot delete task with status '${task.status}'. Approved and completed tasks cannot be deleted.`);
      }

      const response = await formsProxy.deleteTask(taskId, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.DELETE,
        resourceType: 'task',
        resourceId: req.params.id,
        details: { previous_status: task.status },
      });

      res.json(response.data);
    } catch (error) {
      next(error);
    }
  },

  complete: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const taskId = parseInt(req.params.id);
      const response = await formsProxy.completeTask(taskId, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'task',
        resourceId: req.params.id,
        details: { action: 'complete' },
      });

      res.json(response.data);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Start a pending task
   * POST /api/tasks/:id/start
   */
  start: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const taskId = parseInt(req.params.id);
      const response = await formsProxy.startTask(taskId, req.user!.id, req.user!.role);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'task',
        resourceId: req.params.id,
        details: { action: 'start', new_status: 'in_progress' },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Assign or reassign a task
   * POST /api/tasks/:id/assign
   */
  assign: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const taskId = parseInt(req.params.id);
      const { assigned_to_id } = req.body;

      if (!assigned_to_id) {
        throw new ValidationError('assigned_to_id is required');
      }

      const response = await formsProxy.assignTask(taskId, assigned_to_id, req.user!.id, req.user!.role);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'task',
        resourceId: req.params.id,
        details: { action: 'assign', assigned_to_id },
      });

      // Send notification to the new assignee (async, don't block response)
      try {
        const taskData = response.data?.data || response.data;
        const taskTitle = taskData?.title || 'Task';
        const dueDate = taskData?.due_date ? new Date(taskData.due_date) : undefined;

        // Get assigner name
        let assignerName: string | undefined;
        try {
          const assigner = await userQueries.findById(req.user!.id);
          if (assigner) {
            assignerName = assigner.full_name;
          }
        } catch (err) {
          logger.warn('Failed to get assigner name', err);
        }

        // Notify the new assignee
        notificationService.notifyTaskAssigned(
          taskId,
          taskTitle,
          assigned_to_id,
          assignerName,
          dueDate
        ).catch((err) => logger.warn('Failed to send task assignment notification', err));
      } catch (notifyError) {
        logger.warn('Failed to send task assignment notification', notifyError);
      }

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Reopen a rejected or cancelled task
   * POST /api/tasks/:id/reopen
   */
  reopen: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const taskId = parseInt(req.params.id);
      const response = await formsProxy.reopenTask(taskId, req.user!.id, req.user!.role);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'task',
        resourceId: req.params.id,
        details: { action: 'reopen', new_status: 'pending' },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Unblock a blocked task
   * POST /api/tasks/:id/unblock
   */
  unblock: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const taskId = parseInt(req.params.id);
      const response = await formsProxy.unblockTask(taskId, req.user!.id, req.user!.role);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'task',
        resourceId: req.params.id,
        details: { action: 'unblock', new_status: 'pending' },
      });

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // ==========================================================================
  // Task Workflow Actions
  // ==========================================================================

  /**
   * Submit a task for review
   * POST /api/tasks/:taskId/submit
   */
  submitTask: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const taskId = parseInt(req.params.taskId, 10);
      const { notes } = req.body;

      const response = await formsProxy.submitTask(taskId, req.user!.id, notes);

      await logAudit(req, {
        action: AUDIT_ACTIONS.SUBMIT,
        resourceType: 'task',
        resourceId: req.params.taskId,
        details: { action: 'submit_for_review', notes },
      });

      // Send notifications to admins and reviewers (async, don't block response)
      try {
        const taskData = response.data?.data || response.data;
        const taskTitle = taskData?.title || 'Task';
        const projectId = taskData?.project_id;

        // Get project title
        let projectTitle = 'Project';
        if (projectId) {
          const project = await projectQueries.findById(projectId);
          if (project) {
            projectTitle = project.title;
          }
        }

        // Get all admins and reviewers to notify
        const { users: adminsAndReviewers } = await userQueries.findAllUsers(
          { is_active: true },
          { page: 1, limit: 1000 }
        );
        const notifyUserIds = adminsAndReviewers
          .filter((u) => u.role === USER_ROLES.ADMIN || u.role === USER_ROLES.REVIEWER)
          .map((u) => u.id);

        if (notifyUserIds.length > 0) {
          notificationService.notifyTaskStatusChanged(
            taskId,
            taskTitle,
            projectTitle,
            'submitted',
            req.user!.id,
            notifyUserIds,
            notes
          ).catch((err) => logger.warn('Failed to send task submission notifications', err));
        }
      } catch (notifyError) {
        logger.warn('Failed to send task submission notifications', notifyError);
      }

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Approve a task (admin/reviewer only)
   * POST /api/tasks/:taskId/approve
   */
  approveTask: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN && req.user?.role !== USER_ROLES.REVIEWER) {
        throw new ForbiddenError('Admin or reviewer access required');
      }

      const taskId = parseInt(req.params.taskId, 10);
      const { notes } = req.body;

      const response = await formsProxy.approveTask(taskId, req.user.id, req.user.role, notes);

      await logAudit(req, {
        action: AUDIT_ACTIONS.APPROVE,
        resourceType: 'task',
        resourceId: req.params.taskId,
        details: { action: 'approve', notes },
      });

      // Send notification to the task assignee (async, don't block response)
      try {
        const taskData = response.data?.data || response.data;
        const taskTitle = taskData?.title || 'Task';
        const projectId = taskData?.project_id;
        const assignedToId = taskData?.assigned_to_id;

        // Get project title
        let projectTitle = 'Project';
        if (projectId) {
          const project = await projectQueries.findById(projectId);
          if (project) {
            projectTitle = project.title;
          }
        }

        // Notify the assignee if there is one
        if (assignedToId) {
          notificationService.notifyTaskStatusChanged(
            taskId,
            taskTitle,
            projectTitle,
            'approved',
            req.user.id,
            [assignedToId],
            notes
          ).catch((err) => logger.warn('Failed to send task approval notification', err));
        }
      } catch (notifyError) {
        logger.warn('Failed to send task approval notification', notifyError);
      }

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Reject a task (admin/reviewer only)
   * POST /api/tasks/:taskId/reject
   */
  rejectTask: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN && req.user?.role !== USER_ROLES.REVIEWER) {
        throw new ForbiddenError('Admin or reviewer access required');
      }

      const taskId = parseInt(req.params.taskId, 10);
      const { notes } = req.body;

      if (!notes) {
        throw new ValidationError('Notes are required when rejecting a task');
      }

      const response = await formsProxy.rejectTask(taskId, req.user.id, req.user.role, notes);

      await logAudit(req, {
        action: AUDIT_ACTIONS.REJECT,
        resourceType: 'task',
        resourceId: req.params.taskId,
        details: { action: 'reject', notes },
      });

      // Send notification to the task assignee with rejection reason (async, don't block response)
      try {
        const taskData = response.data?.data || response.data;
        const taskTitle = taskData?.title || 'Task';
        const projectId = taskData?.project_id;
        const assignedToId = taskData?.assigned_to_id;

        // Get project title
        let projectTitle = 'Project';
        if (projectId) {
          const project = await projectQueries.findById(projectId);
          if (project) {
            projectTitle = project.title;
          }
        }

        // Notify the assignee if there is one (include rejection reason)
        if (assignedToId) {
          notificationService.notifyTaskStatusChanged(
            taskId,
            taskTitle,
            projectTitle,
            'rejected',
            req.user.id,
            [assignedToId],
            notes // Include rejection reason as reviewer comments
          ).catch((err) => logger.warn('Failed to send task rejection notification', err));
        }
      } catch (notifyError) {
        logger.warn('Failed to send task rejection notification', notifyError);
      }

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Request revision on a task (admin/reviewer only)
   * POST /api/tasks/:taskId/request-revision
   *
   * For document_upload tasks, this also deletes all associated files
   * so the user can re-upload clean files.
   */
  requestRevision: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN && req.user?.role !== USER_ROLES.REVIEWER) {
        throw new ForbiddenError('Admin or reviewer access required');
      }

      const taskId = parseInt(req.params.taskId, 10);
      const { notes } = req.body;

      if (!notes) {
        throw new ValidationError('Notes are required when requesting revision');
      }

      // Get task details first to check type and get assigned user
      const taskResponse = await formsProxy.getTask(taskId, req.user.id);
      const task = taskResponse.data?.data || taskResponse.data;

      // If document_upload task, clear files first before requesting revision
      if (task.task_type === 'document_upload') {
        try {
          const { deletedCount } = await fileService.deleteTaskFiles(taskId);
          logger.info(`Deleted ${deletedCount} files for document_upload task ${taskId} before revision request`);
        } catch (error) {
          logger.error('Failed to delete task files during revision request:', error);
          // Continue with revision request even if file deletion fails
        }
      }

      const response = await formsProxy.requestTaskRevision(taskId, req.user.id, req.user.role, notes);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'task',
        resourceId: req.params.taskId,
        details: {
          action: 'request_revision',
          notes,
          task_type: task.task_type,
          files_deleted: task.task_type === 'document_upload',
        },
      });

      // Send notification to the task assignee with revision comments (async, don't block response)
      try {
        const taskData = response.data?.data || response.data;
        const taskTitle = taskData?.title || task.title || 'Task';
        const projectId = taskData?.project_id || task.project_id;
        const assignedToId = taskData?.assigned_to_id || task.assigned_to_id;

        // Get project title
        let projectTitle = 'Project';
        if (projectId) {
          const project = await projectQueries.findById(projectId);
          if (project) {
            projectTitle = project.title;
          }
        }

        // Notify the assignee if there is one (include revision comments)
        if (assignedToId) {
          notificationService.notifyTaskStatusChanged(
            taskId,
            taskTitle,
            projectTitle,
            'revision_requested',
            req.user.id,
            [assignedToId],
            notes // Include revision comments
          ).catch((err) => logger.warn('Failed to send task revision request notification', err));
        }
      } catch (notifyError) {
        logger.warn('Failed to send task revision request notification', notifyError);
      }

      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get tasks pending review (admin/reviewer only)
   * GET /api/tasks/pending-review
   */
  getPendingReviewTasks: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user?.role !== USER_ROLES.ADMIN && req.user?.role !== USER_ROLES.REVIEWER) {
        throw new ForbiddenError('Admin or reviewer access required');
      }

      const response = await formsProxy.getPendingReviewTasks(req.user.role);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // ==========================================================================
  // Project Tasks
  // ==========================================================================

  /**
   * Get all tasks for a project
   * GET /api/projects/:projectId/tasks
   */
  getProjectTasks: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.params;
      const response = await formsProxy.getProjectTasks(projectId, req.user!.id);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get task completion progress for a project
   * GET /api/projects/:projectId/task-progress
   */
  getProjectTaskProgress: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.params;
      const response = await formsProxy.getProjectTaskProgress(projectId);
      res.json({ success: true, data: response.data });
    } catch (error) {
      next(error);
    }
  },

  // ==========================================================================
  // Create Form for Task
  // ==========================================================================

  /**
   * Create a form instance for a form_completion task
   * POST /api/tasks/:taskId/create-form
   *
   * This endpoint:
   * - Validates the task exists and is of type 'form_completion'
   * - Validates the task doesn't already have a form instance linked
   * - Creates a new form instance with the selected template
   * - Links the form instance to the task
   * - Sets the task status to 'in_progress'
   * - Returns the form_instance_id for redirect
   */
  createFormForTask: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { taskId } = req.params;
      const { template_id } = req.body;

      if (!template_id) {
        throw new ValidationError('template_id is required');
      }

      const response = await formsProxy.createFormForTask(taskId, template_id, req.user!.id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'form_for_task',
        resourceId: taskId,
        details: {
          template_id,
          form_instance_id: response.data?.form_instance_id,
        },
      });

      res.json(response.data);
    } catch (error) {
      next(error);
    }
  },
};

export default taskController;
