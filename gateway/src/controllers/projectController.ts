import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/index.js';
import { projectQueries } from '../database/queries/projectQueries.js';
import { logAudit } from '../middleware/audit.js';
import { AUDIT_ACTIONS } from '../config/constants.js';
import { ValidationError, NotFoundError } from '../utils/errors.js';
import { formsProxy } from '../services/formsProxy.js';

export const projectController = {
  list: async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string | undefined;
      const department = req.query.department as string | undefined;
      const search = req.query.search as string | undefined;

      // Get projects for the current user (either as PI or collaborator)
      const { projects, total } = await projectQueries.findByUserId(req.user!.id, page, limit);

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
};

export default projectController;
