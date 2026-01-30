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

// ============================================================
// Intelligent Form Filling Types
// ============================================================

export interface QuestionnaireQuestion {
  id: string;
  question: string;
  section: string;
  priority: 'required' | 'recommended' | 'optional';
  why_needed: string;
  used_in_forms: string[];
  answer_type: 'text' | 'number' | 'select' | 'multiselect' | 'date' | 'boolean';
  options?: string[];
  suggested_answer?: string;
  suggestion_source?: string;
  suggestion_confidence?: number;
  protocol_field: string;
  answered: boolean;
  skipped: boolean;
}

export interface QuestionnaireSectionInfo {
  key: string;
  name: string;
  icon: string;
  questions: QuestionnaireQuestion[];
  completed_count: number;
  total_count: number;
}

export interface QuestionnaireResponse {
  project_id: string;
  project_type: string | null;
  sections: QuestionnaireSectionInfo[];
  total_questions: number;
  estimated_minutes: number;
}

export interface QuestionnaireAnswerRequest {
  answer: string | number | boolean | string[];
  source: 'wizard' | 'user_input' | 'document' | 'extracted' | 'learned';
}

export interface QuestionnaireAnswerResponse {
  success: boolean;
  next_question_id?: string;
  progress: QuestionnaireProgressResponse;
  facts_added: number;
}

export interface QuestionnaireProgressResponse {
  total_questions: number;
  answered_count: number;
  skipped_count: number;
  completion_percentage: number;
  sections_progress: Record<string, { total: number; answered: number; skipped: number }>;
  is_complete: boolean;
  estimated_remaining_minutes: number;
}

export interface KnowledgeFact {
  key: string;
  value: string | number | boolean | string[];
  source: 'document' | 'wizard' | 'user' | 'learned';
  confidence: number;
}

export interface KnowledgeBaseResponse {
  project_id: string;
  protocol_data: Record<string, unknown>;
  facts: KnowledgeFact[];
  documents: Array<{
    doc_id: string;
    filename: string;
    doc_type: string;
    extracted_at: string;
  }>;
  questionnaire_complete: boolean;
  completion_percentage: number;
}

export interface DocumentUploadResponse {
  success: boolean;
  document_id: string | null;
  filename: string;
  doc_type: string;
  facts_extracted: number;
  quality_score: number | null;
  message: string;
}

export interface KnowledgeSearchResult {
  content: string;
  content_type: string;
  source_key: string;
  score: number;
}

export interface KnowledgeStats {
  total_facts: number;
  facts_by_source: Record<string, number>;
  documents_count: number;
  embeddings_count: number;
  completion_percentage: number;
}

export interface FillFormRequest {
  template_id: number;
  form_id?: number;
  fill_mode: 'all' | 'high_confidence' | 'preview';
  create_if_missing?: boolean;
}

export interface FilledField {
  field_id: string;
  field_label: string;
  value: unknown;
  confidence: number;
  confidence_level: 'high' | 'medium' | 'low';
  source: string;
  evidence?: string;
}

export interface FillFormResult {
  template_id: number;
  template_name?: string;
  filled_fields: FilledField[];
  unfilled_fields: string[];
  fill_rate: number;
  high_confidence_count: number;
  medium_confidence_count: number;
  low_confidence_count: number;
  needs_review_count: number;
  suggested_wizard_questions: string[];
}

export interface FillFormResponse {
  success: boolean;
  form_id: number;
  template_id: number;
  fill_result: FillFormResult;
  message: string;
}

export interface FormFillPreviewResponse {
  template_id: number;
  template_name: string;
  total_fields: number;
  fillable_fields: number;
  fill_rate: number;
  fields: FilledField[];
  high_confidence_count: number;
  medium_confidence_count: number;
  low_confidence_count: number;
}

export interface FormCorrectionRequest {
  field_id: string;
  field_label?: string;
  field_type?: string;
  original_value: unknown;
  corrected_value: unknown;
  project_id?: string;
}

export interface InstitutionPattern {
  id: string;
  pattern_type: string;
  pattern_key: string;
  pattern_value: Record<string, unknown>;
  usage_count: number;
  last_used_at: string;
}

export interface PersonSuggestion {
  name: string;
  title?: string;
  department?: string;
  email?: string;
  phone?: string;
  confidence: number;
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
    const response = await api.get(`/projects/${projectId}/form-task`);
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

  // ============================================================
  // Intelligent Form Filling - Questionnaire API
  // ============================================================

  /**
   * Get the unified questionnaire for a project.
   * This analyzes all tasks/forms and generates questions for missing information.
   */
  getProjectQuestionnaire: async (projectId: string): Promise<QuestionnaireResponse> => {
    const response = await api.get(`/projects/${projectId}/questionnaire`);
    return response.data.data;
  },

  /**
   * Submit an answer to a questionnaire question.
   */
  submitQuestionnaireAnswer: async (
    projectId: string,
    questionId: string,
    answer: QuestionnaireAnswerRequest
  ): Promise<QuestionnaireAnswerResponse> => {
    const response = await api.post(`/projects/${projectId}/questionnaire/answer`, {
      question_id: questionId,
      ...answer,
    });
    return response.data.data;
  },

  /**
   * Skip a questionnaire question.
   */
  skipQuestionnaireQuestion: async (
    projectId: string,
    questionId: string
  ): Promise<QuestionnaireProgressResponse> => {
    const response = await api.post(`/projects/${projectId}/questionnaire/skip/${questionId}`);
    return response.data.data;
  },

  /**
   * Get questionnaire progress for a project.
   */
  getQuestionnaireProgress: async (projectId: string): Promise<QuestionnaireProgressResponse> => {
    const response = await api.get(`/projects/${projectId}/questionnaire/progress`);
    return response.data.data;
  },

  /**
   * Reset the questionnaire (clear answers and restart).
   */
  resetQuestionnaire: async (projectId: string): Promise<{ success: boolean }> => {
    const response = await api.post(`/projects/${projectId}/questionnaire/reset`);
    return response.data.data;
  },

  // ============================================================
  // Intelligent Form Filling - Knowledge Base API
  // ============================================================

  /**
   * Upload a document to extract facts for the knowledge base.
   * This parses the document and uses AI to extract relevant information.
   */
  uploadKnowledgeDocument: async (
    projectId: string,
    file: File,
    docType: string = 'protocol',
    extractFacts: boolean = true
  ): Promise<DocumentUploadResponse> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('doc_type', docType);
    formData.append('extract_facts', String(extractFacts));

    const response = await api.post(`/projects/${projectId}/documents`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data.data;
  },

  /**
   * Get the project knowledge base.
   */
  getProjectKnowledge: async (projectId: string): Promise<KnowledgeBaseResponse> => {
    const response = await api.get(`/projects/${projectId}/knowledge`);
    return response.data.data;
  },

  /**
   * Add facts to the project knowledge base.
   */
  addKnowledgeFacts: async (
    projectId: string,
    facts: KnowledgeFact[]
  ): Promise<{ success: boolean; facts_added: number }> => {
    const response = await api.post(`/projects/${projectId}/knowledge/facts`, { facts });
    return response.data.data;
  },

  /**
   * Search the knowledge base using semantic search.
   */
  searchKnowledge: async (
    projectId: string,
    query: string,
    topK = 5
  ): Promise<KnowledgeSearchResult[]> => {
    const response = await api.post(`/projects/${projectId}/knowledge/search`, {
      query,
      top_k: topK,
    });
    return response.data.data;
  },

  /**
   * Get knowledge base statistics.
   */
  getKnowledgeStats: async (projectId: string): Promise<KnowledgeStats> => {
    const response = await api.get(`/projects/${projectId}/knowledge/stats`);
    return response.data.data;
  },

  // ============================================================
  // Intelligent Form Filling - Form Fill API
  // ============================================================

  /**
   * Fill a form using the project knowledge base.
   */
  fillFormByProject: async (
    projectId: string,
    request: FillFormRequest
  ): Promise<FillFormResponse> => {
    const response = await api.post(`/projects/${projectId}/fill-form`, request);
    return response.data.data;
  },

  /**
   * Preview what form filling would produce.
   */
  previewFormFill: async (
    projectId: string,
    templateId: number
  ): Promise<FormFillPreviewResponse> => {
    const response = await api.get(`/projects/${projectId}/fill-preview/${templateId}`);
    return response.data.data;
  },

  /**
   * Record a user correction for learning.
   */
  recordFormCorrection: async (
    formId: number,
    correction: FormCorrectionRequest
  ): Promise<{ success: boolean }> => {
    const response = await api.post(`/forms/${formId}/correction`, correction);
    return response.data.data;
  },

  // ============================================================
  // Institution Patterns API
  // ============================================================

  /**
   * Get institution patterns (learned entities).
   */
  getInstitutionPatterns: async (
    institutionId: string,
    patternType?: string
  ): Promise<InstitutionPattern[]> => {
    const response = await api.get(`/protocol-assistant/institutions/${institutionId}/patterns`, {
      params: patternType ? { pattern_type: patternType } : undefined,
    });
    return response.data.data;
  },

  /**
   * Suggest PI information based on partial name.
   */
  suggestPI: async (
    institutionId: string,
    query: string
  ): Promise<PersonSuggestion[]> => {
    const response = await api.get(`/protocol-assistant/institutions/${institutionId}/suggest-pi`, {
      params: { query },
    });
    return response.data.data;
  },
};
