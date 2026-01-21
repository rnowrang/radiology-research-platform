import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { projectQueries } from '../database/queries/projectQueries.js';
import { fileQueries } from '../database/queries/fileQueries.js';
import { logAudit } from '../middleware/audit.js';
import { AUDIT_ACTIONS, USER_ROLES } from '../config/constants.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import { formsProxy } from '../services/formsProxy.js';
import { notificationService } from '../services/notificationService.js';
import { userQueries } from '../database/queries/userQueries.js';

export const projectController = {
  list: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string | undefined;
      const department = req.query.department as string | undefined;
      const search = req.query.search as string | undefined;

      // Admins can see all projects, other users only see their own
      let projects;
      let total;
      if (req.user!.role === 'admin') {
        const result = await projectQueries.findAll(page, limit, { status, department, search });
        projects = result.projects;
        total = result.total;
      } else {
        const result = await projectQueries.findByUserId(req.user!.id, page, limit);
        projects = result.projects;
        total = result.total;
      }

      // Also count forms and collaborators for each project
      const projectsWithCounts = await Promise.all(
        projects.map(async (project) => {
          const collaborators = await projectQueries.getCollaborators(project.id);
          let formCount = 0;
          try {
            const formsResponse = await formsProxy.getFormsByProject(project.id);
            formCount = formsResponse.data?.length || 0;
          } catch {
            // If forms-service is unavailable, default to 0
            formCount = 0;
          }
          return {
            ...project,
            form_count: formCount,
            collaborator_count: collaborators.length,
          };
        })
      );

      res.json({
        success: true,
        data: projectsWithCounts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  },

  get: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const project = await projectQueries.findById(id);

      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Check access: user must be PI or collaborator
      const collaborators = await projectQueries.getCollaborators(id);
      const isPI = project.principal_investigator_id === req.user!.id;
      const isCollaborator = collaborators.some(c => c.user_id === req.user!.id);
      const isAdmin = req.user!.role === 'admin';

      if (!isPI && !isCollaborator && !isAdmin) {
        throw new NotFoundError('Project not found');
      }

      res.json({
        success: true,
        data: {
          ...project,
          collaborators,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  create: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title, description, project_type, department, start_date, end_date, is_public } = req.body;

      if (!title) {
        throw new ValidationError('Title is required');
      }

      const project = await projectQueries.create(title, req.user!.id, {
        description,
        project_type,
        department,
        start_date,
        end_date,
        is_public,
      });

      // Sync to forms-service for auto-task creation
      try {
        await formsProxy.createProject({
          id: project.id,
          title: project.title,
          description: project.description,
          project_type: project.project_type,
          department: project.department,
          principal_investigator_id: project.principal_investigator_id,
          start_date: project.start_date?.toISOString().split('T')[0],
          end_date: project.end_date?.toISOString().split('T')[0],
          is_public: project.is_public,
        });
      } catch (error) {
        // Log but don't fail - forms-service sync is not critical
        console.error('Failed to sync project to forms-service:', error);
      }

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'project',
        resourceId: project.id,
        details: { title: project.title },
      });

      res.status(201).json({
        success: true,
        data: project,
        message: 'Project created successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  update: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const project = await projectQueries.findById(id);

      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Only PI or admin can update
      if (project.principal_investigator_id !== req.user!.id && req.user!.role !== 'admin') {
        throw new NotFoundError('Project not found');
      }

      const updated = await projectQueries.update(id, req.body);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'project',
        resourceId: id,
        details: { fields: Object.keys(req.body) },
      });

      res.json({
        success: true,
        data: updated,
        message: 'Project updated successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  delete: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const project = await projectQueries.findById(id);

      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Only PI or admin can delete
      if (project.principal_investigator_id !== req.user!.id && req.user!.role !== 'admin') {
        throw new NotFoundError('Project not found');
      }

      await projectQueries.delete(id);

      await logAudit(req, {
        action: AUDIT_ACTIONS.DELETE,
        resourceType: 'project',
        resourceId: id,
        details: { title: project.title },
      });

      res.json({
        success: true,
        message: 'Project deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  getCollaborators: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const project = await projectQueries.findById(id);

      if (!project) {
        throw new NotFoundError('Project not found');
      }

      const collaborators = await projectQueries.getCollaborators(id);

      res.json({
        success: true,
        data: collaborators,
      });
    } catch (error) {
      next(error);
    }
  },

  addCollaborator: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { user_id, role } = req.body;

      if (!user_id || !role) {
        throw new ValidationError('User ID and role are required');
      }

      const project = await projectQueries.findById(id);

      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Only PI or admin can add collaborators
      if (project.principal_investigator_id !== req.user!.id && req.user!.role !== 'admin') {
        throw new NotFoundError('Project not found');
      }

      await projectQueries.addCollaborator(id, user_id, role);

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'project_collaborator',
        resourceId: id,
        details: { user_id, role },
      });

      res.json({
        success: true,
        message: 'Collaborator added successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  removeCollaborator: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, userId } = req.params;

      const project = await projectQueries.findById(id);

      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Only PI or admin can remove collaborators
      if (project.principal_investigator_id !== req.user!.id && req.user!.role !== 'admin') {
        throw new NotFoundError('Project not found');
      }

      await projectQueries.removeCollaborator(id, userId);

      await logAudit(req, {
        action: AUDIT_ACTIONS.DELETE,
        resourceType: 'project_collaborator',
        resourceId: id,
        details: { user_id: userId },
      });

      res.json({
        success: true,
        message: 'Collaborator removed successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  updateCollaboratorRole: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: projectId, userId } = req.params;
      const { role } = req.body;

      if (!role) {
        throw new ValidationError('Role is required');
      }

      const project = await projectQueries.findById(projectId);

      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Only PI or admin can update collaborator roles
      if (project.principal_investigator_id !== req.user!.id && req.user!.role !== 'admin') {
        throw new ForbiddenError('Only the principal investigator or admin can update collaborator roles');
      }

      await projectQueries.updateCollaboratorRole(projectId, userId, role);

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'project_collaborator',
        resourceId: projectId,
        details: { user_id: userId, role },
      });

      res.json({
        success: true,
        message: 'Collaborator role updated successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get task definitions for a project type preview
   * GET /api/project-types/:projectType/tasks
   * Any authenticated user can access this endpoint
   */
  getTasksForProjectType: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectType } = req.params;

      if (!projectType) {
        throw new ValidationError('Project type is required');
      }

      const result = await formsProxy.getTasksForProjectType(projectType);
      res.json({
        success: true,
        data: result.data,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Manually create a task for a project
   * POST /api/projects/:projectId/tasks
   * Admin only
   */
  createProjectTask: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.params;

      // Admin only
      if (req.user?.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Only administrators can manually create project tasks');
      }

      const {
        task_definition_id,
        title,
        description,
        task_type,
        assigned_to_id,
        due_date,
        priority,
        is_required,
      } = req.body;

      const result = await formsProxy.createProjectTask(
        projectId,
        {
          task_definition_id,
          title,
          description,
          task_type,
          assigned_to_id,
          due_date,
          priority,
          is_required,
        },
        req.user?.id
      );

      await logAudit(req, {
        action: AUDIT_ACTIONS.CREATE,
        resourceType: 'project_task',
        resourceId: projectId,
        details: {
          task_definition_id,
          title,
          task_type,
          assigned_to_id,
        },
      });

      res.status(201).json({
        success: true,
        data: result.data,
        message: 'Task created successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Submit a project for approval
   * POST /api/projects/:id/submit-for-approval
   * PI or admin can submit
   */
  submitForApproval: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      const project = await projectQueries.findById(id);
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Check permission: only PI or admin can submit
      const isPI = project.principal_investigator_id === req.user!.id;
      const isAdmin = req.user!.role === USER_ROLES.ADMIN;
      if (!isPI && !isAdmin) {
        throw new ForbiddenError('Only the principal investigator or admin can submit this project for approval');
      }

      // Call forms-service to validate and update status
      const result = await formsProxy.submitProjectForApproval(id, req.user!.id, notes);

      // Update local project status
      await projectQueries.update(id, { status: 'pending_approval' });

      await logAudit(req, {
        action: AUDIT_ACTIONS.SUBMIT,
        resourceType: 'project',
        resourceId: id,
        details: { title: project.title, notes },
      });

      // Notify all admins about new project submission
      try {
        const admins = await userQueries.findByRole(USER_ROLES.ADMIN);
        for (const admin of admins) {
          if (admin.id !== req.user!.id) {
            await notificationService.createNotification(
              admin.id,
              'approval_request',
              'Project submitted for approval',
              `Project "${project.title}" has been submitted for approval`,
              `/projects/${id}`
            );
          }
        }
      } catch (notifyError) {
        // Don't fail the request if notifications fail
        console.error('Failed to send notifications:', notifyError);
      }

      res.json({
        success: true,
        data: result.data,
        message: 'Project submitted for approval successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Approve a project
   * POST /api/projects/:id/approve
   * Admin only
   */
  approveProject: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      // Admin only
      if (req.user!.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Only administrators can approve projects');
      }

      const project = await projectQueries.findById(id);
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Call forms-service to update status
      const result = await formsProxy.approveProject(id, req.user!.id, req.user!.role, notes);

      // Update local project status
      await projectQueries.update(id, { status: 'approved' });

      await logAudit(req, {
        action: AUDIT_ACTIONS.APPROVE,
        resourceType: 'project',
        resourceId: id,
        details: { title: project.title, notes },
      });

      // Notify the PI about approval
      try {
        const approverName = req.user!.full_name || 'An administrator';
        await notificationService.createNotification(
          project.principal_investigator_id,
          'status_change',
          'Project approved',
          `Your project "${project.title}" has been approved by ${approverName}`,
          `/projects/${id}`
        );
      } catch (notifyError) {
        // Don't fail the request if notifications fail
        console.error('Failed to send notification:', notifyError);
      }

      res.json({
        success: true,
        data: result.data,
        message: 'Project approved successfully',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Reject a project
   * POST /api/projects/:id/reject
   * Admin only
   */
  rejectProject: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      // Admin only
      if (req.user!.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Only administrators can reject projects');
      }

      if (!notes || !notes.trim()) {
        throw new ValidationError('Rejection notes are required');
      }

      const project = await projectQueries.findById(id);
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Call forms-service to update status
      const result = await formsProxy.rejectProject(id, req.user!.id, req.user!.role, notes);

      // Update local project status
      await projectQueries.update(id, { status: 'rejected' });

      await logAudit(req, {
        action: AUDIT_ACTIONS.REJECT,
        resourceType: 'project',
        resourceId: id,
        details: { title: project.title, notes },
      });

      // Notify the PI about rejection
      try {
        const rejecterName = req.user!.full_name || 'An administrator';
        await notificationService.createNotification(
          project.principal_investigator_id,
          'status_change',
          'Project requires changes',
          `Your project "${project.title}" has been rejected by ${rejecterName}. Reason: ${notes}`,
          `/projects/${id}`
        );
      } catch (notifyError) {
        // Don't fail the request if notifications fail
        console.error('Failed to send notification:', notifyError);
      }

      res.json({
        success: true,
        data: result.data,
        message: 'Project rejected',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Request changes on a project
   * POST /api/projects/:id/request-changes
   * Admin only
   */
  requestChangesProject: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      // Admin only
      if (req.user!.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Only administrators can request changes on projects');
      }

      if (!notes || !notes.trim()) {
        throw new ValidationError('Notes are required when requesting changes');
      }

      const project = await projectQueries.findById(id);
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Call forms-service to update status
      const result = await formsProxy.requestChangesProject(id, req.user!.id, req.user!.role, notes);

      // Update local project status
      await projectQueries.update(id, { status: 'needs_changes' });

      await logAudit(req, {
        action: AUDIT_ACTIONS.UPDATE,
        resourceType: 'project',
        resourceId: id,
        details: { title: project.title, notes, action: 'request_changes' },
      });

      // Notify the PI about requested changes
      try {
        const reviewerName = req.user!.full_name || 'An administrator';
        await notificationService.createNotification(
          project.principal_investigator_id,
          'status_change',
          'Project requires changes',
          `Your project "${project.title}" requires changes. Reviewer: ${reviewerName}. Notes: ${notes}`,
          `/projects/${id}`
        );
      } catch (notifyError) {
        console.error('Failed to send notification:', notifyError);
      }

      res.json({
        success: true,
        data: result.data,
        message: 'Changes requested on project',
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get project review summary for admin review page
   * GET /api/projects/:projectId/review-summary
   * Admin only - aggregates all information needed for AdminProjectReviewPage
   */
  getProjectReviewSummary: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { projectId } = req.params;

      // Admin only
      if (req.user!.role !== USER_ROLES.ADMIN) {
        throw new ForbiddenError('Only administrators can access project review summaries');
      }

      // Get project details with PI info
      const project = await projectQueries.findById(projectId);
      if (!project) {
        throw new NotFoundError('Project not found');
      }

      // Fetch all data in parallel for better performance
      const [formsResponse, tasksResponse, filesResult] = await Promise.all([
        // Get forms for project from forms-service
        formsProxy.getFormsByProject(projectId).catch(() => ({ data: [] })),
        // Get tasks for project from forms-service
        formsProxy.getProjectTasks(projectId, req.user!.id).catch(() => ({ data: [] })),
        // Get files for project from local database
        fileQueries.findFilesByProjectId(projectId, 1, 100),
      ]);

      const forms = formsResponse.data || [];
      const tasks = tasksResponse.data || [];
      const files = filesResult.files || [];

      // Calculate progress stats
      const completedTasks = tasks.filter((t: { status: string }) => t.status === 'completed' || t.status === 'approved').length;
      const totalTasks = tasks.length;
      const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      // Project type labels
      const projectTypeLabels: Record<string, string> = {
        retrospective: 'Retrospective Study',
        prospective: 'Prospective Study',
        clinical_trial: 'Clinical Trial',
        quality_improvement: 'Quality Improvement',
        other: 'Other',
      };

      // Format response
      res.json({
        success: true,
        data: {
          project: {
            id: project.id,
            title: project.title,
            status: project.status,
            project_type: project.project_type,
            project_type_label: projectTypeLabels[project.project_type] || project.project_type,
            description: project.description,
            department: project.department,
            created_at: project.created_at,
            updated_at: project.updated_at,
            submitted_at: project.updated_at, // Use updated_at as fallback since submitted_for_approval_at doesn't exist
          },
          principal_investigator: {
            id: project.principal_investigator_id,
            name: project.principal_investigator_name || 'Unknown',
            email: project.principal_investigator_email || '',
          },
          forms: forms.map((f: { id: number; title: string; status: string; template_name?: string; updated_at: string }) => ({
            id: f.id,
            title: f.title,
            status: f.status,
            template_name: f.template_name || '',
            updated_at: f.updated_at,
          })),
          tasks: tasks.map((t: { id: number; title?: string; name?: string; status: string; task_type?: string; completed_at?: string; due_date?: string }) => ({
            id: t.id,
            name: t.title || t.name || '',
            status: t.status,
            task_type: t.task_type || '',
            completed_at: t.completed_at || null,
            due_date: t.due_date || null,
          })),
          files: files.map((f) => ({
            id: f.id,
            original_file_name: f.original_file_name,
            file_size: f.file_size,
            mime_type: f.mime_type,
            category: f.category || 'other',
            created_at: f.created_at,
            uploaded_by_name: f.uploaded_by_name || '',
            task_id: f.task_id || null,
            task_status: f.task_status || null,
            task_title: f.task_title || null,
          })),
          progress: {
            tasks_completed: completedTasks,
            tasks_total: totalTasks,
            forms_count: forms.length,
            percentage,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  },
};

export default projectController;
