import { api } from './api';

export interface ChatSession {
  session_id: string;
  project_id: string;
  status: string;
  has_extracted_protocol: boolean;
  extracted_protocol?: Record<string, unknown>;
  current_gaps?: GapQuestion[];
  created_at: string;
  updated_at?: string;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  message_type: string;
  created_at: string;
}

export interface ChatResponse {
  response: string;
  message_id: number;
  suggestions: string[];
  available_actions: string[];
}

export interface GeneratedDocument {
  doc_type: string;
  content: Record<string, unknown>;
  word_count: number;
  quality_score: number;
  suggestions: string[];
}

export interface GapQuestion {
  question: string;
  section: string;
  priority: 'high' | 'medium' | 'low';
  answered?: boolean;
}

export interface UploadResponse {
  success: boolean;
  message: string;
  extracted_protocol?: Record<string, unknown>;
  gaps?: GapQuestion[];
}

export interface PrefillResponse {
  success: boolean;
  form_id: number;
  prefilled_fields: string[];
  confidence_scores: Record<string, number>;
}

// Wizard types
export interface SuggestedAnswer {
  id: string;
  text: string;
  source: 'document' | 'ai' | 'common';
  confidence?: number;
}

export interface FormFieldInfo {
  form_type: string;
  section: string;
  field_name: string;
  field_label: string;
}

export interface EnhancedGapQuestion {
  id: string;
  question: string;
  section: string;
  priority: 'high' | 'medium' | 'low';
  rationale?: string;
  suggested_answers: SuggestedAnswer[];
  extracted_value?: string;
  extracted_confidence?: number;
  form_field?: FormFieldInfo;
  average_time_seconds: number;
  answered: boolean;
  skipped: boolean;
}

export interface SectionInfo {
  key: string;  // Original section key (e.g., "study_info", "methodology")
  name: string; // Display name (e.g., "Study Information", "Methodology")
  icon: string;
  question_count: number;
}

export interface AnswerRecord {
  answer: string;
  source: 'suggested' | 'freetext' | 'extracted';
  timestamp: string;
}

export interface WizardProgress {
  total_questions: number;
  answered_count: number;
  skipped_count: number;
  current_index: number;
  sections_progress: Record<string, { total: number; answered: number }>;
  estimated_remaining_minutes: number;
  percent_complete: number;
}

export interface WizardQuestionsResponse {
  questions: EnhancedGapQuestion[];
  sections: SectionInfo[];
  total_estimated_minutes: number;
}

export interface AnswerRequest {
  answer: string;
  source: 'suggested' | 'freetext' | 'extracted';
}

export interface AnswerResponse {
  success: boolean;
  updated_protocol?: Record<string, unknown>;
  next_question_id?: string;
  progress: WizardProgress;
}

export interface SkipResponse {
  success: boolean;
  next_question_id?: string;
  progress: WizardProgress;
}

export interface SuggestionsResponse {
  suggestions: SuggestedAnswer[];
}

export interface FormPrefillPreview {
  form_fields: Array<{
    field_name: string;
    field_label: string;
    current_value?: string;
    new_value?: string;
    confidence?: number;
  }>;
  total_fields: number;
  fields_to_populate: number;
}

export interface WizardPrefillResult {
  success: boolean;
  form_id: number;
  fields_populated: number;
  redirect_url?: string;
}

// Task-aware pre-fill types
export interface ProjectFormTask {
  task: {
    id: number;
    title: string;
    task_type: string;
    status: string;
    form_instance_id: number | null;
    task_definition: {
      template_id: number;
      name: string;
    } | null;
  } | null;
  form: {
    id: number;
    title: string;
    status: string;
    completion_percentage: number;
  } | null;
  available_templates: Array<{
    id: number;
    name: string;
    field_count: number;
  }>;
  has_form: boolean;
}

export interface PrefillTaskFormRequest {
  project_id: string;
  task_id: number;
  template_id?: number;
}

export interface FieldConflict {
  field_id: string;
  field_label: string;
  existing_value: unknown;
  new_value: unknown;
  source: string;
}

export interface PrefillTaskFormResponse {
  success: boolean;
  form_id: number;
  task_id: number;
  conflicts: FieldConflict[];
  fields_updated: number;
  fields_skipped: number;
  redirect_url: string;
}

export const protocolAssistantApi = {
  // Session management
  getOrCreateSession: async (projectId: string): Promise<ChatSession> => {
    const response = await api.get(`/protocol-assistant/projects/${projectId}/session`);
    return response.data.data;
  },

  createSession: async (projectId: string): Promise<ChatSession> => {
    const response = await api.post('/protocol-assistant/sessions', { project_id: projectId });
    return response.data.data;
  },

  getSession: async (sessionId: string): Promise<ChatSession> => {
    const response = await api.get(`/protocol-assistant/sessions/${sessionId}`);
    return response.data.data;
  },

  // Chat
  getHistory: async (
    sessionId: string,
    limit = 50,
    offset = 0
  ): Promise<{ messages: ChatMessage[]; total: number }> => {
    const response = await api.get(`/protocol-assistant/sessions/${sessionId}/history`, {
      params: { limit, offset },
    });
    return response.data.data;
  },

  sendMessage: async (sessionId: string, content: string): Promise<ChatResponse> => {
    const response = await api.post(`/protocol-assistant/sessions/${sessionId}/chat`, {
      content,
      message_type: 'chat',
    });
    return response.data.data;
  },

  // Document upload
  uploadDocument: async (sessionId: string, file: File): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(
      `/protocol-assistant/sessions/${sessionId}/documents/upload`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
    const result = response.data.data;
    // Check if extraction was successful (backend returns success: false on error)
    if (result && result.success === false) {
      throw new Error(result.error || 'Failed to extract protocol from document');
    }
    return result;
  },

  // Gap questions
  getGapQuestions: async (sessionId: string): Promise<GapQuestion[]> => {
    const response = await api.get(`/protocol-assistant/sessions/${sessionId}/gaps`);
    return response.data.data;
  },

  submitGapAnswers: async (sessionId: string, answers: Record<string, string>): Promise<void> => {
    await api.post(`/protocol-assistant/sessions/${sessionId}/gaps/answers`, { answers });
  },

  // Generation
  generateAbstract: async (sessionId: string, wordLimit = 350): Promise<GeneratedDocument> => {
    const response = await api.post(
      `/protocol-assistant/sessions/${sessionId}/generate/abstract`,
      {},
      { params: { word_limit: wordLimit } }
    );
    return response.data.data;
  },

  generateConsent: async (sessionId: string): Promise<GeneratedDocument> => {
    const response = await api.post(
      `/protocol-assistant/sessions/${sessionId}/generate/consent`
    );
    return response.data.data;
  },

  generateProtocol: async (sessionId: string): Promise<GeneratedDocument> => {
    const response = await api.post(
      `/protocol-assistant/sessions/${sessionId}/generate/protocol`
    );
    return response.data.data;
  },

  generateRecruitment: async (sessionId: string): Promise<GeneratedDocument> => {
    const response = await api.post(
      `/protocol-assistant/sessions/${sessionId}/generate/recruitment`
    );
    return response.data.data;
  },

  generateDataManagement: async (sessionId: string): Promise<GeneratedDocument> => {
    const response = await api.post(
      `/protocol-assistant/sessions/${sessionId}/generate/data-management`
    );
    return response.data.data;
  },

  generateAll: async (sessionId: string): Promise<GeneratedDocument[]> => {
    const response = await api.post(`/protocol-assistant/sessions/${sessionId}/generate-all`);
    return response.data.data?.documents || response.data.data;
  },

  prefillForm: async (sessionId: string, formId: number): Promise<PrefillResponse> => {
    const response = await api.post(
      `/protocol-assistant/sessions/${sessionId}/prefill-form/${formId}`
    );
    return response.data.data;
  },

  // Document types
  getDocumentTypes: async (): Promise<Array<{ id: string; name: string; description: string }>> => {
    const response = await api.get('/protocol-assistant/document-types');
    return response.data.data?.document_types || [];
  },

  // Progress
  getProgress: async (sessionId: string): Promise<{ completion_percentage: number; stages: Record<string, boolean> }> => {
    const response = await api.get(`/protocol-assistant/sessions/${sessionId}/progress`);
    return response.data.data;
  },

  // Wizard methods
  getWizardQuestions: async (sessionId: string): Promise<WizardQuestionsResponse> => {
    const response = await api.get(`/protocol-assistant/sessions/${sessionId}/wizard/questions`);
    return response.data.data;
  },

  submitWizardAnswer: async (
    sessionId: string,
    questionId: string,
    answer: AnswerRequest
  ): Promise<AnswerResponse> => {
    const response = await api.post(
      `/protocol-assistant/sessions/${sessionId}/wizard/questions/${questionId}/answer`,
      answer
    );
    return response.data.data;
  },

  skipWizardQuestion: async (sessionId: string, questionId: string): Promise<SkipResponse> => {
    const response = await api.post(
      `/protocol-assistant/sessions/${sessionId}/wizard/questions/${questionId}/skip`
    );
    return response.data.data;
  },

  getWizardProgress: async (sessionId: string): Promise<WizardProgress> => {
    const response = await api.get(`/protocol-assistant/sessions/${sessionId}/wizard/progress`);
    return response.data.data;
  },

  getQuestionSuggestions: async (
    sessionId: string,
    questionId: string
  ): Promise<SuggestionsResponse> => {
    const response = await api.get(
      `/protocol-assistant/sessions/${sessionId}/wizard/questions/${questionId}/suggestions`
    );
    return response.data.data;
  },

  getFormPrefillPreview: async (
    sessionId: string,
    formId?: number
  ): Promise<FormPrefillPreview> => {
    const response = await api.get(
      `/protocol-assistant/sessions/${sessionId}/wizard/form-preview`,
      { params: formId ? { formId } : {} }
    );
    return response.data.data;
  },

  prefillFormFromWizard: async (
    sessionId: string,
    formId: number
  ): Promise<WizardPrefillResult> => {
    const response = await api.post(
      `/protocol-assistant/sessions/${sessionId}/wizard/prefill-form`,
      { formId }
    );
    return response.data.data;
  },

  // Task-aware pre-fill methods
  getProjectFormTask: async (projectId: string): Promise<ProjectFormTask> => {
    const response = await api.get(`/api/projects/${projectId}/form-task`);
    return response.data.data;
  },

  prefillTaskForm: async (
    sessionId: string,
    request: PrefillTaskFormRequest
  ): Promise<PrefillTaskFormResponse> => {
    const response = await api.post(
      `/protocol-assistant/sessions/${sessionId}/prefill-task-form`,
      request
    );
    return response.data.data;
  },
};
