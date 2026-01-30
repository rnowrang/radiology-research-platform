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

  // Wizard endpoints
  getWizardQuestions: async (sessionId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.get(`/api/protocol-assistant/sessions/${sessionId}/wizard/questions`, {
      headers: buildUserHeaders(userContext),
    });
  },

  submitWizardAnswer: async (
    sessionId: string,
    questionId: string,
    answerData: { answer: string; source: string },
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(
      `/api/protocol-assistant/sessions/${sessionId}/wizard/questions/${questionId}/answer`,
      answerData,
      { headers: buildUserHeaders(userContext) }
    );
  },

  skipWizardQuestion: async (
    sessionId: string,
    questionId: string,
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(
      `/api/protocol-assistant/sessions/${sessionId}/wizard/questions/${questionId}/skip`,
      {},
      { headers: buildUserHeaders(userContext) }
    );
  },

  getWizardProgress: async (sessionId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.get(`/api/protocol-assistant/sessions/${sessionId}/wizard/progress`, {
      headers: buildUserHeaders(userContext),
    });
  },

  getQuestionSuggestions: async (
    sessionId: string,
    questionId: string,
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.get(
      `/api/protocol-assistant/sessions/${sessionId}/wizard/questions/${questionId}/suggestions`,
      { headers: buildUserHeaders(userContext) }
    );
  },

  getFormPrefillPreview: async (
    sessionId: string,
    formId: string | undefined,
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    const params = formId ? { formId } : undefined;
    return protocolClient.get(`/api/protocol-assistant/sessions/${sessionId}/wizard/form-preview`, {
      params,
      headers: buildUserHeaders(userContext),
    });
  },

  prefillFormFromWizard: async (
    sessionId: string,
    prefillData: { formId: number },
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(
      `/api/protocol-assistant/sessions/${sessionId}/wizard/prefill-form`,
      prefillData,
      { headers: buildUserHeaders(userContext) }
    );
  },

  /**
   * Pre-fill a task-linked form using protocol assistant data
   * Creates a form instance linked to a task and pre-fills it with extracted protocol data
   */
  prefillTaskForm: async (
    sessionId: string,
    body: { project_id: string; task_id: number; template_id?: number },
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(
      `/api/protocol-assistant/sessions/${sessionId}/prefill-task-form`,
      body,
      { headers: buildUserHeaders(userContext) }
    );
  },

  // Health check
  healthCheck: async (): Promise<AxiosResponse> => {
    return protocolClient.get('/health');
  },

  // ============================================================
  // Intelligent Form Filling - Questionnaire Endpoints
  // ============================================================

  /**
   * Get unified questionnaire for a project
   */
  getProjectQuestionnaire: async (projectId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.get(`/api/projects/${projectId}/questionnaire`, {
      headers: buildUserHeaders(userContext),
    });
  },

  /**
   * Submit answer to questionnaire question
   */
  submitQuestionnaireAnswer: async (
    projectId: string,
    answerData: { question_id: string; answer: string; source?: string },
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/projects/${projectId}/questionnaire/answer`, answerData, {
      headers: buildUserHeaders(userContext),
    });
  },

  /**
   * Skip a questionnaire question
   */
  skipQuestionnaireQuestion: async (
    projectId: string,
    questionId: string,
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/projects/${projectId}/questionnaire/skip/${questionId}`, {}, {
      headers: buildUserHeaders(userContext),
    });
  },

  /**
   * Get questionnaire progress
   */
  getQuestionnaireProgress: async (projectId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.get(`/api/projects/${projectId}/questionnaire/progress`, {
      headers: buildUserHeaders(userContext),
    });
  },

  /**
   * Reset questionnaire
   */
  resetQuestionnaire: async (projectId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/projects/${projectId}/questionnaire/reset`, {}, {
      headers: buildUserHeaders(userContext),
    });
  },

  // ============================================================
  // Intelligent Form Filling - Knowledge Base Endpoints
  // ============================================================

  /**
   * Get project knowledge base
   */
  getProjectKnowledge: async (projectId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.get(`/api/projects/${projectId}/knowledge`, {
      headers: buildUserHeaders(userContext),
    });
  },

  /**
   * Add facts to knowledge base
   */
  addKnowledgeFacts: async (
    projectId: string,
    facts: Array<{ key: string; value: string; source?: string; confidence?: number }>,
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/projects/${projectId}/knowledge/facts`, { facts }, {
      headers: buildUserHeaders(userContext),
    });
  },

  /**
   * Semantic search in knowledge base
   */
  searchKnowledgeBase: async (
    projectId: string,
    query: string,
    topK: number = 5,
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/projects/${projectId}/knowledge/search`, { query, top_k: topK }, {
      headers: buildUserHeaders(userContext),
    });
  },

  /**
   * Get knowledge base stats
   */
  getKnowledgeStats: async (projectId: string, user: string | UserContext): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.get(`/api/projects/${projectId}/knowledge/stats`, {
      headers: buildUserHeaders(userContext),
    });
  },

  /**
   * Upload document to knowledge base
   */
  uploadKnowledgeDocument: async (
    projectId: string,
    file: Express.Multer.File,
    docType: string = 'protocol',
    extractFacts: boolean = true,
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;

    // Create FormData for multipart upload
    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });
    formData.append('doc_type', docType);
    formData.append('extract_facts', String(extractFacts));

    return protocolClient.post(`/api/projects/${projectId}/documents`, formData, {
      headers: {
        ...buildUserHeaders(userContext),
        ...formData.getHeaders(),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  },

  // ============================================================
  // Intelligent Form Filling - Form Fill Endpoints
  // ============================================================

  /**
   * Fill a form using project knowledge base
   */
  fillForm: async (
    projectId: string,
    templateId: number,
    options: { fill_mode?: string; overwrite_existing?: boolean; form_id?: number; create_if_missing?: boolean } = {},
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/projects/${projectId}/fill-form`, {
      template_id: templateId,
      ...options,
    }, {
      headers: buildUserHeaders(userContext),
    });
  },

  /**
   * Preview form fill results
   */
  previewFormFill: async (
    projectId: string,
    templateId: number,
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.get(`/api/projects/${projectId}/fill-preview/${templateId}`, {
      headers: buildUserHeaders(userContext),
    });
  },

  /**
   * Record form correction for learning
   */
  recordFormCorrection: async (
    formId: number,
    corrections: Array<{
      field_id: string;
      field_label?: string;
      original_value: unknown;
      corrected_value: unknown;
    }>,
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.post(`/api/forms/${formId}/correction`, {
      form_id: formId,
      corrections,
    }, {
      headers: buildUserHeaders(userContext),
    });
  },

  /**
   * Get institution patterns (learned entities)
   */
  getInstitutionPatterns: async (
    institutionId: string,
    patternType?: string,
    user: string | UserContext = { userId: '', role: 'researcher' }
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    const params = patternType ? { pattern_type: patternType } : undefined;
    return protocolClient.get(`/api/institutions/${institutionId}/patterns`, {
      params,
      headers: buildUserHeaders(userContext),
    });
  },

  /**
   * Suggest PI information
   */
  suggestPI: async (
    institutionId: string,
    query: string,
    user: string | UserContext
  ): Promise<AxiosResponse> => {
    const userContext = typeof user === 'string' ? { userId: user, role: 'researcher' } : user;
    return protocolClient.get(`/api/institutions/${institutionId}/suggest-pi`, {
      params: { query },
      headers: buildUserHeaders(userContext),
    });
  },
};

// Export types and utility functions
export { UserContext, buildUserHeaders, userToContext };
export default protocolAssistantProxy;
