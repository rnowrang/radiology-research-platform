import axios, { AxiosInstance, AxiosError, AxiosResponse } from 'axios';
import FormData from 'form-data';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

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
  createSession: async (projectId: string, userId: string): Promise<AxiosResponse> => {
    return protocolClient.post('/api/protocol-assistant/sessions',
      { project_id: projectId },
      { headers: { 'X-User-ID': userId } }
    );
  },

  getSession: async (sessionId: string, userId: string): Promise<AxiosResponse> => {
    return protocolClient.get(`/api/protocol-assistant/sessions/${sessionId}`, {
      headers: { 'X-User-ID': userId },
    });
  },

  updateSession: async (sessionId: string, updates: Record<string, unknown>, userId: string): Promise<AxiosResponse> => {
    return protocolClient.patch(`/api/protocol-assistant/sessions/${sessionId}`, updates, {
      headers: { 'X-User-ID': userId },
    });
  },

  closeSession: async (sessionId: string, userId: string): Promise<AxiosResponse> => {
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/close`, null, {
      headers: { 'X-User-ID': userId },
    });
  },

  getOrCreateProjectSession: async (projectId: string, userId: string): Promise<AxiosResponse> => {
    return protocolClient.get(`/api/protocol-assistant/projects/${projectId}/session`, {
      headers: { 'X-User-ID': userId },
    });
  },

  // Chat
  sendMessage: async (sessionId: string, content: string, messageType: string, userId: string): Promise<AxiosResponse> => {
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/chat`,
      { content, message_type: messageType },
      { headers: { 'X-User-ID': userId } }
    );
  },

  getHistory: async (sessionId: string, limit: number, offset: number, userId: string): Promise<AxiosResponse> => {
    return protocolClient.get(`/api/protocol-assistant/sessions/${sessionId}/history`, {
      params: { limit, offset },
      headers: { 'X-User-ID': userId },
    });
  },

  // Streaming (returns raw response for SSE forwarding)
  streamResponse: async (sessionId: string, message: string, userId: string): Promise<AxiosResponse> => {
    return protocolClient.get(`/api/protocol-assistant/sessions/${sessionId}/stream`, {
      params: { message },
      headers: { 'X-User-ID': userId },
      responseType: 'stream',
    });
  },

  // Document upload and processing
  uploadDocument: async (
    sessionId: string,
    file: Buffer,
    filename: string,
    mimetype: string,
    userId: string
  ): Promise<AxiosResponse> => {
    const formData = new FormData();
    formData.append('file', file, {
      filename,
      contentType: mimetype,
    });

    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/documents/upload`, formData, {
      headers: {
        ...formData.getHeaders(),
        'X-User-ID': userId,
      },
      timeout: 180000, // 3 minutes for large documents
    });
  },

  getDocuments: async (sessionId: string, userId: string): Promise<AxiosResponse> => {
    return protocolClient.get(`/api/protocol-assistant/sessions/${sessionId}/documents`, {
      headers: { 'X-User-ID': userId },
    });
  },

  getExtractedProtocol: async (sessionId: string, userId: string): Promise<AxiosResponse> => {
    return protocolClient.get(`/api/protocol-assistant/sessions/${sessionId}/protocol`, {
      headers: { 'X-User-ID': userId },
    });
  },

  // Gap questions
  getGapQuestions: async (sessionId: string, userId: string): Promise<AxiosResponse> => {
    return protocolClient.get(`/api/protocol-assistant/sessions/${sessionId}/gaps`, {
      headers: { 'X-User-ID': userId },
    });
  },

  submitGapAnswers: async (sessionId: string, answers: Record<string, string>, userId: string): Promise<AxiosResponse> => {
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/gaps/answers`,
      { answers },
      { headers: { 'X-User-ID': userId } }
    );
  },

  // Document generation
  generateAbstract: async (sessionId: string, wordLimit: number, userId: string): Promise<AxiosResponse> => {
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/generate/abstract`, null, {
      params: { word_limit: wordLimit },
      headers: { 'X-User-ID': userId },
      timeout: 180000, // 3 minutes for LLM generation
    });
  },

  generateConsentForm: async (sessionId: string, userId: string): Promise<AxiosResponse> => {
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/generate/consent`, null, {
      headers: { 'X-User-ID': userId },
      timeout: 180000,
    });
  },

  generateProtocol: async (sessionId: string, userId: string): Promise<AxiosResponse> => {
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/generate/protocol`, null, {
      headers: { 'X-User-ID': userId },
      timeout: 180000,
    });
  },

  generateRecruitmentMaterials: async (sessionId: string, userId: string): Promise<AxiosResponse> => {
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/generate/recruitment`, null, {
      headers: { 'X-User-ID': userId },
      timeout: 180000,
    });
  },

  generateDataManagementPlan: async (sessionId: string, userId: string): Promise<AxiosResponse> => {
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/generate/data-management`, null, {
      headers: { 'X-User-ID': userId },
      timeout: 180000,
    });
  },

  generateDocument: async (
    sessionId: string,
    docType: string,
    wordLimit: number | undefined,
    userId: string
  ): Promise<AxiosResponse> => {
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/generate`, null, {
      params: { doc_type: docType, word_limit: wordLimit },
      headers: { 'X-User-ID': userId },
      timeout: 180000,
    });
  },

  generateAllDocuments: async (
    sessionId: string,
    docTypes: string[] | undefined,
    userId: string
  ): Promise<AxiosResponse> => {
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/generate-all`, null, {
      params: docTypes ? { doc_types: docTypes } : undefined,
      headers: { 'X-User-ID': userId },
      timeout: 300000, // 5 minutes for bulk generation
    });
  },

  // Form prefill
  prefillForm: async (sessionId: string, formId: number, userId: string): Promise<AxiosResponse> => {
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/prefill-form/${formId}`, null, {
      headers: { 'X-User-ID': userId },
    });
  },

  createPrefilledForm: async (
    sessionId: string,
    templateId: number,
    title: string | undefined,
    projectId: string | undefined,
    userId: string
  ): Promise<AxiosResponse> => {
    return protocolClient.post(`/api/protocol-assistant/sessions/${sessionId}/create-prefilled-form`, null, {
      params: { template_id: templateId, title, project_id: projectId },
      headers: { 'X-User-ID': userId },
    });
  },

  // Document types
  getDocumentTypes: async (): Promise<AxiosResponse> => {
    return protocolClient.get('/api/protocol-assistant/document-types');
  },

  // Progress tracking
  getProgress: async (sessionId: string, userId: string): Promise<AxiosResponse> => {
    return protocolClient.get(`/api/protocol-assistant/sessions/${sessionId}/progress`, {
      headers: { 'X-User-ID': userId },
    });
  },

  // Admin endpoints
  getStats: async (userId: string, userRole: string): Promise<AxiosResponse> => {
    return protocolClient.get('/api/admin/analytics/usage', {
      headers: { 'X-User-ID': userId, 'X-User-Role': userRole },
    });
  },

  // Health check
  healthCheck: async (): Promise<AxiosResponse> => {
    return protocolClient.get('/health');
  },
};

export default protocolAssistantProxy;
