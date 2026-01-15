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

  // Review
  submitForReview: async (formId: number, userId: string, notes?: string): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/form/${formId}/submit`, {
      user_id: userId,
      notes,
    });
  },

  requestChanges: async (formId: number, userId: string, notes?: string): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/form/${formId}/request-changes`, {
      user_id: userId,
      notes,
    });
  },

  approveForm: async (formId: number, userId: string, notes?: string): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/form/${formId}/approve`, {
      user_id: userId,
      notes,
    });
  },

  rejectForm: async (formId: number, userId: string, notes?: string): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/form/${formId}/reject`, {
      user_id: userId,
      notes,
    });
  },

  returnToDraft: async (formId: number, userId: string, notes?: string): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/form/${formId}/return-to-draft`, {
      user_id: userId,
      notes,
    });
  },

  // Comments
  getComments: async (formId: number): Promise<AxiosResponse> => {
    return formsClient.get(`/api/review/form/${formId}/comments`);
  },

  addComment: async (
    formId: number,
    userId: string,
    content: string,
    fieldId?: string,
    sectionId?: string,
    threadId?: number
  ): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/form/${formId}/comments`, {
      user_id: userId,
      content,
      field_id: fieldId,
      section_id: sectionId,
      thread_id: threadId,
    });
  },

  resolveThread: async (formId: number, threadId: number, userId: string): Promise<AxiosResponse> => {
    return formsClient.post(`/api/review/form/${formId}/comments/${threadId}/resolve`, {
      user_id: userId,
    });
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
};

export default formsProxy;
