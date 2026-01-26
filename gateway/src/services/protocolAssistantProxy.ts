import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import FormData from 'form-data';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';
import { User } from '../types/index.js';

/**
 * User context to pass to Protocol Assistant.
 * Contains all user information needed for authentication and authorization.
 */
interface UserContext {
  userId: string;
  role: string;
  email?: string;
  name?: string;
  institutionId?: string;
}

/**
 * Build headers with user context for Protocol Assistant requests.
 */
function buildUserHeaders(userContext: UserContext): Record<string, string> {
  const headers: Record<string, string> = {
    'X-User-ID': userContext.userId,
    'X-User-Role': userContext.role,
  };

  if (userContext.email) {
    headers['X-User-Email'] = userContext.email;
  }

  if (userContext.name) {
    headers['X-User-Name'] = userContext.name;
  }

  if (userContext.institutionId) {
    headers['X-Institution-ID'] = userContext.institutionId;
  }

  return headers;
}

/**
 * Convert User object to UserContext for Protocol Assistant.
 */
function userToContext(user: User, institutionId?: string): UserContext {
  return {
    userId: user.id,
    role: user.role,
    email: user.email,
    name: user.full_name,
    institutionId,
  };
}

// Create axios instance for Protocol Assistant Service
const protocolClient: AxiosInstance = axios.create({
  baseURL: config.protocolAssistant.url,
  timeout: 120000, // 120 seconds for LLM operations
  headers: {
    'Content-Type': 'application/json',
    'X-Internal-API-Key': config.protocolAssistant.apiKey,
  },
});

// Request interceptor for logging
protocolClient.interceptors.request.use(
  (reqConfig) => {
    logger.debug(`Protocol Assistant Request: ${reqConfig.method?.toUpperCase()} ${reqConfig.url}`);
    return reqConfig;
  },
  (error) => {
    logger.error('Protocol Assistant Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging and error handling
protocolClient.interceptors.response.use(
  (response) => {
    logger.debug(`Protocol Assistant Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error: AxiosError) => {
    if (error.response) {
      logger.error(`Protocol Assistant Error: ${error.response.status} ${error.config?.url}`);

      // Transform error for client
      const data = error.response.data as { detail?: string; message?: string };
      throw new AppError(
        data?.detail || data?.message || 'Protocol assistant service error',
        error.response.status
      );
    } else if (error.request) {
      logger.error('Protocol Assistant: No response received');
      throw new AppError('Protocol assistant service unavailable', 503);
    } else {
      logger.error('Protocol Assistant: Request setup error', error.message);
      throw new AppError('Protocol assistant service request failed', 500);
    }
  }
);

export const protocolAssistantProxy = {
  // Sessions
  createSession: async (projectId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post('/api/protocol-assistant/sessions',
      { project_id: projectId },
      { headers: buildUserHeaders(userContext) }
    );
  },

  getSession: async (sessionId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.get(`/api/protocol-assistant/sessions/${sessionId}`, {
      headers: buildUserHeaders(userContext),
    });
  },

  updateSession: async (sessionId: string, updates: Record<string, unknown>, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.patch(`/api/protocol-assistant/sessions/${sessionId}`, updates, {
      headers: buildUserHeaders(userContext),
    });
  },

  closeSession: async (sessionId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/close`, null, {
      headers: buildUserHeaders(userContext),
    });
  },

  resetSessionProtocol: async (sessionId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/reset-protocol`, null, {
      headers: buildUserHeaders(userContext),
    });
  },

  getOrCreateProjectSession: async (projectId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.get(`/api/protocol-assistant/projects/${projectId}/session`, {
      headers: buildUserHeaders(userContext),
    });
  },

  // Chat
  sendMessage: async (sessionId: string, content: string, messageType: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/chat`,
      { content, message_type: messageType },
      { headers: buildUserHeaders(userContext) }
    );
  },

  getHistory: async (sessionId: string, limit: number, offset: number, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.get(`/api/protocol-assistant/sessions/${sessionId}/history`, {
      params: { limit, offset },
      headers: buildUserHeaders(userContext),
    });
  },

  // Streaming (returns raw response for SSE forwarding)
  streamResponse: async (sessionId: string, message: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.get(`/api/protocol-assistant/sessions/${sessionId}/stream`, {
      params: { message },
      headers: buildUserHeaders(userContext),
      responseType: 'stream',
    });
  },

  // Document upload and processing
  uploadDocument: async (
    sessionId: string,
    file: Buffer,
    filename: string,
    mimetype: string,
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    const formData = new FormData();
    formData.append('file', file, {
      filename,
      contentType: mimetype,
    });

    return protocolClient.post(`/api/documents/extract-protocol`, formData, {
      headers: {
        ...formData.getHeaders(),
        ...buildUserHeaders(userContext),
        'X-Session-ID': sessionId,
      },
      timeout: 180000, // 3 minutes for large documents
    });
  },

  getDocuments: async (sessionId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.get(`/api/protocol-assistant/sessions/${sessionId}/documents`, {
      headers: buildUserHeaders(userContext),
    });
  },

  getExtractedProtocol: async (sessionId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.get(`/api/protocol-assistant/sessions/${sessionId}/protocol`, {
      headers: buildUserHeaders(userContext),
    });
  },

  // Gap questions
  getGapQuestions: async (sessionId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.get(`/api/protocol-assistant/sessions/${sessionId}/gaps`, {
      headers: buildUserHeaders(userContext),
    });
  },

  submitGapAnswers: async (sessionId: string, answers: Record<string, string>, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/gaps/answers`,
      { answers },
      { headers: buildUserHeaders(userContext) }
    );
  },

  // Document generation
  generateAbstract: async (sessionId: string, wordLimit: number, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/generate/abstract`, null, {
      params: { word_limit: wordLimit },
      headers: buildUserHeaders(userContext),
      timeout: 180000, // 3 minutes for LLM generation
    });
  },

  generateConsentForm: async (sessionId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/generate/consent`, null, {
      headers: buildUserHeaders(userContext),
      timeout: 180000,
    });
  },

  generateProtocol: async (sessionId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/generate/protocol`, null, {
      headers: buildUserHeaders(userContext),
      timeout: 180000,
    });
  },

  generateRecruitmentMaterials: async (sessionId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/generate/recruitment`, null, {
      headers: buildUserHeaders(userContext),
      timeout: 180000,
    });
  },

  generateDataManagementPlan: async (sessionId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/generate/data-management`, null, {
      headers: buildUserHeaders(userContext),
      timeout: 180000,
    });
  },

  generateDocument: async (
    sessionId: string,
    docType: string,
    wordLimit: number | undefined,
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/generate`, null, {
      params: { doc_type: docType, word_limit: wordLimit },
      headers: buildUserHeaders(userContext),
      timeout: 180000,
    });
  },

  generateAllDocuments: async (
    sessionId: string,
    docTypes: string[] | undefined,
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/generate-all`, null, {
      params: docTypes ? { doc_types: docTypes } : undefined,
      headers: buildUserHeaders(userContext),
      timeout: 300000, // 5 minutes for bulk generation
    });
  },

  // Form prefill
  prefillForm: async (sessionId: string, formId: number, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/prefill-form/${formId}`, null, {
      headers: buildUserHeaders(userContext),
    });
  },

  createPrefilledForm: async (
    sessionId: string,
    templateId: number,
    title: string | undefined,
    projectId: string | undefined,
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/create-prefilled-form`, null, {
      params: { template_id: templateId, title, project_id: projectId },
      headers: buildUserHeaders(userContext),
    });
  },

  // Document types
  getDocumentTypes: async (): Promise<AxiosResponse> => {
    return protocolClient.get('/api/protocol-assistant/document-types');
  },

  // Progress tracking
  getProgress: async (sessionId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.get(`/api/protocol-assistant/sessions/${sessionId}/progress`, {
      headers: buildUserHeaders(userContext),
    });
  },

  // Admin endpoints
  getStats: async (user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'admin' } : user;
    return protocolClient.get('/api/admin/analytics/usage', {
      headers: buildUserHeaders(userContext),
    });
  },

  // Admin knowledge base endpoints
  getKnowledgeCategories: async (user: UserContext): Promise<AxiosResponse> => {
    return protocolClient.get('/api/admin/knowledge/categories', {
      headers: buildUserHeaders(user),
    });
  },

  searchKnowledge: async (query: string, category: string | undefined, limit: number, user: UserContext): Promise<AxiosResponse> => {
    return protocolClient.get('/api/admin/knowledge/search', {
      params: { query, category, limit },
      headers: buildUserHeaders(user),
    });
  },

  // Admin prompt management
  getPromptKeys: async (user: UserContext): Promise<AxiosResponse> => {
    return protocolClient.get('/api/admin/prompts/keys', {
      headers: buildUserHeaders(user),
    });
  },

  getPromptVersions: async (promptKey: string, includeInactive: boolean, user: UserContext): Promise<AxiosResponse> => {
    return protocolClient.get(`/api/admin/prompts/${promptKey}/versions`, {
      params: { include_inactive: includeInactive },
      headers: buildUserHeaders(user),
    });
  },

  // Admin analytics
  getQualityMetrics: async (startDate: string | undefined, endDate: string | undefined, user: UserContext): Promise<AxiosResponse> => {
    return protocolClient.get('/api/admin/analytics/quality', {
      params: { start_date: startDate, end_date: endDate },
      headers: buildUserHeaders(user),
    });
  },

  getCostAnalytics: async (startDate: string | undefined, endDate: string | undefined, user: UserContext): Promise<AxiosResponse> => {
    return protocolClient.get('/api/admin/analytics/costs', {
      params: { start_date: startDate, end_date: endDate },
      headers: buildUserHeaders(user),
    });
  },

  getDailyTrends: async (startDate: string | undefined, endDate: string | undefined, user: UserContext): Promise<AxiosResponse> => {
    return protocolClient.get('/api/admin/analytics/trends', {
      params: { start_date: startDate, end_date: endDate },
      headers: buildUserHeaders(user),
    });
  },

  // Health check
  healthCheck: async (): Promise<AxiosResponse> => {
    return protocolClient.get('/health');
  },
};

// Export types and utility functions
export { UserContext, buildUserHeaders, userToContext };
export default protocolAssistantProxy;
