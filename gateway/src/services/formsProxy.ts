import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

// Create axios instance for Forms Service
const formsClient: AxiosInstance = axios.create({
  baseURL: config.formsService.url,
  timeout: 60000, // 60 seconds for PDF generation
  headers: {
    'Content-Type': 'application/json',
    'X-Internal-API-Key': config.formsService.apiKey,
  },
});

// Request interceptor for logging
formsClient.interceptors.request.use(
  (reqConfig) => {
    logger.debug(`Forms Service Request: ${reqConfig.method?.toUpperCase()} ${reqConfig.url}`);
    return reqConfig;
  },
  (error) => {
    logger.error('Forms Service Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging and error handling
formsClient.interceptors.response.use(
  (response) => {
    logger.debug(`Forms Service Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error: AxiosError) => {
    if (error.response) {
      logger.error(`Forms Service Error: ${error.response.status} ${error.config?.url}`);

      // Transform error for client
      const data = error.response.data as { detail?: string; message?: string };
      throw new AppError(
        data?.detail || data?.message || 'Forms service error',
        error.response.status
      );
    } else if (error.request) {
      logger.error('Forms Service: No response received');
      throw new AppError('Forms service unavailable', 503);
    } else {
      logger.error('Forms Service: Request setup error', error.message);
      throw new AppError('Forms service request failed', 500);
    }
  }
);

// Helper to add user context to requests
const withUserContext = (userId: string, data: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...data,
  _user_id: userId,
});

export const formsProxy = {
  // Templates
  getTemplates: async (): Promise<AxiosResponse> => {
    return formsClient.get('/api/templates');
  },

  getPublishedTemplates: async (): Promise<AxiosResponse> => {
    return formsClient.get('/api/templates/published');
  },

  getTemplate: async (templateId: number): Promise<AxiosResponse> => {
    return formsClient.get(`/api/templates/${templateId}`);
  },

  // Forms
  getForms: async (userId: string, params?: Record<string, unknown>): Promise<AxiosResponse> => {
    return formsClient.get('/api/forms', {
      params: { ...params, owner_id: userId },
      headers: { 'X-User-ID': userId },
    });
  },

  getAllForms: async (params?: Record<string, unknown>): Promise<AxiosResponse> => {
    return formsClient.get('/api/forms', { params });
  },

  getForm: async (formId: number, userId?: string): Promise<AxiosResponse> => {
    return formsClient.get(`/api/forms/${formId}`, {
      headers: userId ? { 'X-User-ID': userId } : {},
    });
  },

  createForm: async (
    templateId: number,
    title: string,
    ownerId: string,
    projectId?: string
  ): Promise<AxiosResponse> => {
    return formsClient.post('/api/forms', {
      template_id: templateId,
      title,
      owner_id: ownerId,
      project_id: projectId,
    });
  },

  updateFormData: async (
    formId: number,
    changes: Array<{ field_id: string; field_label?: string; old_value?: unknown; new_value: unknown }>,
    userId: string
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/forms/${formId}/data`, {
      changes,
      user_id: userId,
    });
  },

  // Versions
  getVersions: async (formId: number): Promise<AxiosResponse> => {
    return formsClient.get(`/api/versions/form/${formId}`);
  },

  getVersion: async (versionId: number): Promise<AxiosResponse> => {
    return formsClient.get(`/api/versions/${versionId}`);
  },

  createVersion: async (formId: number, label: string, userId: string): Promise<AxiosResponse> => {
    return formsClient.post(`/api/versions/form/${formId}/create`, {
      version_label: label,
      user_id: userId,
    });
  },

  // Review Queue
  getReviewQueue: async (userRole: string, status?: string): Promise<AxiosResponse> => {
    return formsClient.get('/api/review/queue', {
      params: status ? { status } : {},
      headers: { 'X-User-Role': userRole },
    });
  },

  // Review Actions
  submitForReview: async (formId: number, userId: string, notes?: string): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/forms/${formId}/submit`,
      { notes },
      { headers: { 'X-User-ID': userId } }
    );
  },

  requestChanges: async (formId: number, userId: string, userRole: string, notes: string): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/forms/${formId}/request-changes`,
      { notes },
      { headers: { 'X-User-ID': userId, 'X-User-Role': userRole } }
    );
  },

  approveForm: async (formId: number, userId: string, userRole: string, notes?: string): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/forms/${formId}/approve`,
      { notes },
      { headers: { 'X-User-ID': userId, 'X-User-Role': userRole } }
    );
  },

  rejectForm: async (formId: number, userId: string, userRole: string, notes: string): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/forms/${formId}/reject`,
      { notes },
      { headers: { 'X-User-ID': userId, 'X-User-Role': userRole } }
    );
  },

  returnToDraft: async (formId: number, userId: string, notes?: string): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/forms/${formId}/return-to-draft`,
      { notes },
      { headers: { 'X-User-ID': userId } }
    );
  },

  getReviewHistory: async (formId: number): Promise<AxiosResponse> => {
    return formsClient.get(`/api/review/forms/${formId}/history`);
  },

  // Comments
  getComments: async (formId: number, includeResolved: boolean = false): Promise<AxiosResponse> => {
    return formsClient.get(`/api/review/forms/${formId}/comments`, {
      params: { include_resolved: includeResolved },
    });
  },

  addComment: async (
    formId: number,
    userId: string,
    content: string,
    fieldId?: string,
    sectionId?: string,
    parentCommentId?: number
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/forms/${formId}/comments`, {
      content,
      field_id: fieldId,
      section_id: sectionId,
      parent_comment_id: parentCommentId,
    }, { headers: { 'X-User-ID': userId } });
  },

  getMentionableUsers: async (formId: number): Promise<AxiosResponse> => {
    return formsClient.get(`/api/review/forms/${formId}/mentionable-users`);
  },

  replyToThread: async (threadId: number, userId: string, content: string, parentCommentId?: number): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/threads/${threadId}/reply`, {
      content,
      parent_comment_id: parentCommentId,
    }, { headers: { 'X-User-ID': userId } });
  },

  resolveThread: async (threadId: number, userId: string): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/threads/${threadId}/resolve`, {},
      { headers: { 'X-User-ID': userId } }
    );
  },

  reopenThread: async (threadId: number): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/threads/${threadId}/reopen`);
  },

  updateComment: async (commentId: number, userId: string, content: string): Promise<AxiosResponse> => {
    return formsClient.put(`/api/review/comments/${commentId}`,
      { content },
      { headers: { 'X-User-ID': userId } }
    );
  },

  deleteComment: async (commentId: number, userId: string): Promise<AxiosResponse> => {
    return formsClient.delete(`/api/review/comments/${commentId}`,
      { headers: { 'X-User-ID': userId } }
    );
  },

  // Export
  generateDocuments: async (formId: number, versionId?: number): Promise<AxiosResponse> => {
    return formsClient.post(`/api/export/form/${formId}/generate`, {
      version_id: versionId,
    });
  },

  getDocx: async (formId: number, versionId?: number): Promise<AxiosResponse> => {
    return formsClient.get(`/api/export/form/${formId}/docx`, {
      params: { version_id: versionId },
      responseType: 'arraybuffer',
    });
  },

  getPdf: async (formId: number, versionId?: number): Promise<AxiosResponse> => {
    return formsClient.get(`/api/export/form/${formId}/pdf`, {
      params: { version_id: versionId },
      responseType: 'arraybuffer',
    });
  },

  // Audit
  getAuditLog: async (formId: number, params?: Record<string, unknown>): Promise<AxiosResponse> => {
    return formsClient.get(`/api/audit/form/${formId}`, { params });
  },

  getFieldHistory: async (formId: number, fieldId: string): Promise<AxiosResponse> => {
    return formsClient.get(`/api/audit/form/${formId}/field/${fieldId}`);
  },

  // Health check
  health: async (): Promise<AxiosResponse> => {
    return formsClient.get('/health');
  },

  // Project sync
  createProject: async (projectData: {
    id: string;
    title: string;
    description?: string;
    project_type?: string;
    department?: string;
    principal_investigator_id: string;
    start_date?: string;
    end_date?: string;
    is_public?: boolean;
  }): Promise<AxiosResponse> => {
    return formsClient.post('/api/projects', projectData);
  },

  getFormsByProject: async (projectId: string): Promise<AxiosResponse> => {
    return formsClient.get('/api/forms', { params: { project_id: projectId } });
  },

  // Editing Locks
  acquireLock: async (
    formId: number,
    userId: string,
    sectionId?: string,
    durationMinutes: number = 5
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/forms/${formId}/lock`, {
      section_id: sectionId,
      duration_minutes: durationMinutes,
    }, { headers: { 'X-User-ID': userId } });
  },

  releaseLock: async (
    formId: number,
    userId: string,
    sectionId?: string
  ): Promise<AxiosResponse> => {
    return formsClient.delete(`/api/forms/${formId}/lock`, {
      params: { section_id: sectionId },
      headers: { 'X-User-ID': userId },
    });
  },

  checkLock: async (formId: number, sectionId?: string): Promise<AxiosResponse> => {
    return formsClient.get(`/api/forms/${formId}/lock`, {
      params: { section_id: sectionId },
    });
  },

  getAllLocks: async (formId: number): Promise<AxiosResponse> => {
    return formsClient.get(`/api/forms/${formId}/locks`);
  },

  extendLock: async (
    formId: number,
    userId: string,
    sectionId?: string,
    durationMinutes: number = 5
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/forms/${formId}/lock/extend`, {
      section_id: sectionId,
      duration_minutes: durationMinutes,
    }, { headers: { 'X-User-ID': userId } });
  },

  forceReleaseLock: async (
    formId: number,
    userId: string,
    userRole: string,
    sectionId?: string
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/forms/${formId}/lock/force-release`, {
      section_id: sectionId,
    }, { headers: { 'X-User-ID': userId, 'X-User-Role': userRole } });
  },

  acquireSectionLock: async (
    formId: number,
    sectionId: string,
    userId: string,
    durationMinutes: number = 5
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/forms/${formId}/sections/${sectionId}/lock`, null, {
      params: { duration_minutes: durationMinutes },
      headers: { 'X-User-ID': userId },
    });
  },

  releaseSectionLock: async (
    formId: number,
    sectionId: string,
    userId: string
  ): Promise<AxiosResponse> => {
    return formsClient.delete(`/api/forms/${formId}/sections/${sectionId}/lock`, {
      headers: { 'X-User-ID': userId },
    });
  },

  checkSectionLock: async (formId: number, sectionId: string): Promise<AxiosResponse> => {
    return formsClient.get(`/api/forms/${formId}/sections/${sectionId}/lock`);
  },

  // Tasks
  getTasks: async (userId: string, params?: Record<string, unknown>): Promise<AxiosResponse> => {
    return formsClient.get('/api/tasks', {
      params: { ...params },
      headers: { 'X-User-ID': userId },
    });
  },

  getTask: async (taskId: number, userId: string): Promise<AxiosResponse> => {
    return formsClient.get(`/api/tasks/${taskId}`, {
      headers: { 'X-User-ID': userId },
    });
  },

  createTask: async (data: Record<string, unknown>, userId: string): Promise<AxiosResponse> => {
    return formsClient.post('/api/tasks', {
      ...data,
      created_by_id: userId,
    });
  },

  updateTask: async (taskId: number, data: Record<string, unknown>, userId: string): Promise<AxiosResponse> => {
    return formsClient.put(`/api/tasks/${taskId}`, data, {
      headers: { 'X-User-ID': userId },
    });
  },

  deleteTask: async (taskId: number, userId: string): Promise<AxiosResponse> => {
    return formsClient.delete(`/api/tasks/${taskId}`, {
      headers: { 'X-User-ID': userId },
    });
  },

  completeTask: async (taskId: number, userId: string): Promise<AxiosResponse> => {
    return formsClient.post(`/api/tasks/${taskId}/complete`, {}, {
      headers: { 'X-User-ID': userId },
    });
  },

  // Amendments
  getFormAmendments: async (formId: number, status?: string): Promise<AxiosResponse> => {
    return formsClient.get(`/api/forms/${formId}/amendments`, {
      params: status ? { status_filter: status } : {},
    });
  },

  createAmendment: async (
    formId: number,
    userId: string,
    amendmentType: string,
    description?: string
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/forms/${formId}/amendments`, {
      amendment_type: amendmentType,
      description,
    }, { headers: { 'X-User-ID': userId } });
  },

  getAmendment: async (amendmentId: number): Promise<AxiosResponse> => {
    return formsClient.get(`/api/amendments/${amendmentId}`);
  },

  updateAmendment: async (
    amendmentId: number,
    userId: string,
    data: { amendment_type?: string; description?: string }
  ): Promise<AxiosResponse> => {
    return formsClient.put(`/api/amendments/${amendmentId}`, data, {
      headers: { 'X-User-ID': userId },
    });
  },

  deleteAmendment: async (amendmentId: number, userId: string): Promise<AxiosResponse> => {
    return formsClient.delete(`/api/amendments/${amendmentId}`, {
      headers: { 'X-User-ID': userId },
    });
  },

  addAmendmentFieldChange: async (
    amendmentId: number,
    userId: string,
    data: {
      field_id: string;
      field_label?: string;
      old_value?: unknown;
      new_value?: unknown;
      justification?: string;
    }
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/amendments/${amendmentId}/changes`, data, {
      headers: { 'X-User-ID': userId },
    });
  },

  updateAmendmentFieldChange: async (
    amendmentId: number,
    changeId: number,
    userId: string,
    data: {
      field_label?: string;
      old_value?: unknown;
      new_value?: unknown;
      justification?: string;
    }
  ): Promise<AxiosResponse> => {
    return formsClient.put(`/api/amendments/${amendmentId}/changes/${changeId}`, data, {
      headers: { 'X-User-ID': userId },
    });
  },

  removeAmendmentFieldChange: async (
    amendmentId: number,
    changeId: number,
    userId: string
  ): Promise<AxiosResponse> => {
    return formsClient.delete(`/api/amendments/${amendmentId}/changes/${changeId}`, {
      headers: { 'X-User-ID': userId },
    });
  },

  submitAmendment: async (amendmentId: number, userId: string): Promise<AxiosResponse> => {
    return formsClient.post(`/api/amendments/${amendmentId}/submit`, {}, {
      headers: { 'X-User-ID': userId },
    });
  },

  approveAmendment: async (
    amendmentId: number,
    userId: string,
    notes?: string
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/amendments/${amendmentId}/approve`, { notes }, {
      headers: { 'X-User-ID': userId },
    });
  },

  rejectAmendment: async (
    amendmentId: number,
    userId: string,
    notes: string
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/amendments/${amendmentId}/reject`, { notes }, {
      headers: { 'X-User-ID': userId },
    });
  },

  withdrawAmendment: async (amendmentId: number, userId: string): Promise<AxiosResponse> => {
    return formsClient.post(`/api/amendments/${amendmentId}/withdraw`, {}, {
      headers: { 'X-User-ID': userId },
    });
  },

  // ==========================================================================
  // Review Stages - Admin Management
  // ==========================================================================

  getReviewStages: async (userRole: string, activeOnly: boolean = true): Promise<AxiosResponse> => {
    return formsClient.get('/api/admin/review-stages', {
      params: { active_only: activeOnly },
      headers: { 'X-User-Role': userRole },
    });
  },

  createReviewStage: async (
    userRole: string,
    data: {
      code: string;
      name: string;
      description?: string;
      sequence_order: number;
      default_deadline_days?: number;
      requires_all_previous?: boolean;
      is_active?: boolean;
    }
  ): Promise<AxiosResponse> => {
    return formsClient.post('/api/admin/review-stages', data, {
      headers: { 'X-User-Role': userRole },
    });
  },

  getReviewStage: async (userRole: string, stageId: number): Promise<AxiosResponse> => {
    return formsClient.get(`/api/admin/review-stages/${stageId}`, {
      headers: { 'X-User-Role': userRole },
    });
  },

  updateReviewStage: async (
    userRole: string,
    stageId: number,
    data: {
      code?: string;
      name?: string;
      description?: string;
      sequence_order?: number;
      default_deadline_days?: number;
      requires_all_previous?: boolean;
      is_active?: boolean;
    }
  ): Promise<AxiosResponse> => {
    return formsClient.put(`/api/admin/review-stages/${stageId}`, data, {
      headers: { 'X-User-Role': userRole },
    });
  },

  deleteReviewStage: async (userRole: string, stageId: number): Promise<AxiosResponse> => {
    return formsClient.delete(`/api/admin/review-stages/${stageId}`, {
      headers: { 'X-User-Role': userRole },
    });
  },

  reorderReviewStages: async (userRole: string, stageIds: number[]): Promise<AxiosResponse> => {
    return formsClient.post('/api/admin/review-stages/reorder', { stage_ids: stageIds }, {
      headers: { 'X-User-Role': userRole },
    });
  },

  // ==========================================================================
  // Review Stages - Form Progress and Actions
  // ==========================================================================

  getFormReviewProgress: async (formId: number): Promise<AxiosResponse> => {
    return formsClient.get(`/api/review/forms/${formId}/stages`);
  },

  assignReviewerToStage: async (
    formId: number,
    stageId: number,
    userRole: string,
    reviewerId: string,
    deadline?: string
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/forms/${formId}/stages/${stageId}/assign`, {
      reviewer_id: reviewerId,
      deadline,
    }, {
      headers: { 'X-User-Role': userRole },
    });
  },

  startStageReview: async (
    formId: number,
    stageId: number,
    userId: string,
    userRole: string
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/forms/${formId}/stages/${stageId}/start`, {}, {
      headers: { 'X-User-ID': userId, 'X-User-Role': userRole },
    });
  },

  completeStageReview: async (
    formId: number,
    stageId: number,
    userId: string,
    userRole: string,
    status: string,
    comments?: string
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/forms/${formId}/stages/${stageId}/complete`, {
      status,
      comments,
    }, {
      headers: { 'X-User-ID': userId, 'X-User-Role': userRole },
    });
  },

  advanceFormToNextStage: async (
    formId: number,
    userRole: string,
    reviewerId?: string
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/forms/${formId}/advance`, {
      reviewer_id: reviewerId,
    }, {
      headers: { 'X-User-Role': userRole },
    });
  },

  // ==========================================================================
  // Task Definitions - Admin Management
  // ==========================================================================

  getTaskDefinitions: async (activeOnly: boolean = true): Promise<AxiosResponse> => {
    return formsClient.get('/api/task-definitions', {
      params: { active_only: activeOnly },
    });
  },

  createTaskDefinition: async (data: {
    name: string;
    description?: string;
    task_type: string;
    auto_submit?: boolean;
    default_required?: boolean;
    display_order?: number;
    is_active?: boolean;
  }): Promise<AxiosResponse> => {
    return formsClient.post('/api/task-definitions', data);
  },

  updateTaskDefinition: async (
    definitionId: number,
    data: {
      name?: string;
      description?: string;
      task_type?: string;
      auto_submit?: boolean;
      default_required?: boolean;
      display_order?: number;
      is_active?: boolean;
    }
  ): Promise<AxiosResponse> => {
    return formsClient.put(`/api/task-definitions/${definitionId}`, data);
  },

  deleteTaskDefinition: async (definitionId: number): Promise<AxiosResponse> => {
    return formsClient.delete(`/api/task-definitions/${definitionId}`);
  },

  // ==========================================================================
  // Project Type Mappings - Admin Management
  // ==========================================================================

  getProjectTypeMappings: async (): Promise<AxiosResponse> => {
    return formsClient.get('/api/task-definitions/mappings/all');
  },

  getProjectTypeMappingsByType: async (projectType: string): Promise<AxiosResponse> => {
    return formsClient.get(`/api/task-definitions/mappings/${projectType}`);
  },

  createProjectTypeMapping: async (data: {
    project_type: string;
    task_definition_id: number;
    is_required?: boolean;
    display_order?: number;
  }): Promise<AxiosResponse> => {
    return formsClient.post('/api/task-definitions/mappings', data);
  },

  deleteProjectTypeMapping: async (mappingId: number): Promise<AxiosResponse> => {
    return formsClient.delete(`/api/task-definitions/mappings/${mappingId}`);
  },

  // ==========================================================================
  // Enhanced Task Operations - Workflow Actions
  // ==========================================================================

  submitTask: async (taskId: number, userId: string, notes?: string): Promise<AxiosResponse> => {
    return formsClient.post(`/api/tasks/${taskId}/submit`, { notes }, {
      headers: { 'X-User-ID': userId },
    });
  },

  approveTask: async (
    taskId: number,
    userId: string,
    userRole: string,
    notes?: string
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/tasks/${taskId}/approve`, { notes }, {
      headers: { 'X-User-ID': userId, 'X-User-Role': userRole },
    });
  },

  rejectTask: async (
    taskId: number,
    userId: string,
    userRole: string,
    notes: string
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/tasks/${taskId}/reject`, { notes }, {
      headers: { 'X-User-ID': userId, 'X-User-Role': userRole },
    });
  },

  requestTaskRevision: async (
    taskId: number,
    userId: string,
    userRole: string,
    notes: string
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/tasks/${taskId}/request-revision`, { notes }, {
      headers: { 'X-User-ID': userId, 'X-User-Role': userRole },
    });
  },

  getPendingReviewTasks: async (userRole: string): Promise<AxiosResponse> => {
    return formsClient.get('/api/tasks/pending-review', {
      headers: { 'X-User-Role': userRole },
    });
  },

  // ==========================================================================
  // Project Tasks and Progress
  // ==========================================================================

  getProjectTasks: async (projectId: string, userId: string): Promise<AxiosResponse> => {
    return formsClient.get(`/api/projects/${projectId}/tasks`, {
      headers: { 'X-User-ID': userId },
    });
  },

  getProjectTaskProgress: async (projectId: string): Promise<AxiosResponse> => {
    return formsClient.get(`/api/projects/${projectId}/task-progress`);
  },

  createProjectTask: async (
    projectId: string,
    data: {
      task_definition_id?: number;
      title?: string;
      description?: string;
      task_type?: string;
      assigned_to_id?: string;
      due_date?: string;
      priority?: string;
      is_required?: boolean;
    },
    userId?: string
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/projects/${projectId}/tasks`, data, {
      headers: userId ? { 'X-User-Id': userId } : {},
    });
  },

  // ==========================================================================
  // Auto-Complete Upload Task
  // ==========================================================================

  /**
   * Auto-complete a document_upload task when a matching file is uploaded.
   *
   * File Category Mapping:
   * - proposal -> Upload Research Proposal
   * - abstract -> Upload Study Abstract
   * - protocol -> Upload Study Protocol
   * - consent_form -> Upload Consent Form
   * - citi_certificate -> Upload CITI Training Certificate
   * - funding -> Upload Funding Documentation
   * - data_management -> Upload Data Management Plan
   */
  autoCompleteUploadTask: async (
    projectId: string,
    fileCategory: string
  ): Promise<AxiosResponse> => {
    return formsClient.post('/api/tasks/auto-complete-upload', null, {
      params: {
        project_id: projectId,
        file_category: fileCategory,
      },
    });
  },

  // ==========================================================================
  // Sync Task Status from Form
  // ==========================================================================

  /**
   * Sync task status when form status changes.
   * Called after form submit/approve/reject/request-changes actions.
   */
  syncTaskStatusFromForm: async (
    formInstanceId: number,
    newFormStatus: string
  ): Promise<AxiosResponse> => {
    return formsClient.post('/api/tasks/sync-from-form', null, {
      params: {
        form_instance_id: formInstanceId,
        new_form_status: newFormStatus,
      },
    });
  },

  // ==========================================================================
  // Task Preview for Project Type (Public - Authenticated Users)
  // ==========================================================================

  /**
   * Get task definitions for a project type preview
   * Used during project creation to show what tasks will be created
   */
  getTasksForProjectType: async (projectType: string): Promise<AxiosResponse> => {
    return formsClient.get(`/api/task-definitions/project-types/${projectType}/tasks`);
  },

  // ==========================================================================
  // Create Form for Task
  // ==========================================================================

  /**
   * Create a form instance for a form_completion task
   * Links the new form to the task and sets task status to in_progress
   */
  createFormForTask: async (
    taskId: string,
    templateId: number,
    userId: string
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/tasks/${taskId}/create-form`, {
      template_id: templateId,
    }, {
      headers: { 'X-User-ID': userId },
    });
  },
};

export default formsProxy;
