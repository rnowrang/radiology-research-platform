/**
 * Unified Intelligence API Client
 *
 * Provides a single interface for all Research Intelligence Assistant features:
 * - Chat/conversation
 * - Guided questionnaire
 * - Document management
 * - Coherence checking
 * - Knowledge base operations
 */

import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ============================================================================
// Types
// ============================================================================

export interface Question {
  id: string;
  question: string;
  section: string;
  priority: 'high' | 'medium' | 'low' | 'required' | 'recommended' | 'optional';
  answerType: 'text' | 'number' | 'select' | 'multiselect' | 'date' | 'boolean';
  options?: string[];
  rationale?: string;
  whyNeeded?: string;
  usedInForms?: string[];
  protocolField?: string;
  suggestedAnswer?: string;
  suggestedAnswerConfidence?: number;
  suggestedAnswerSource?: string;
}

export interface Section {
  id: string;
  name: string;
  description?: string;
  questions: Question[];
}

export interface QuestionnaireResponse {
  projectId: string;
  sections: Section[];
  estimatedMinutes: number;
  projectType?: string;
}

export interface AnswerSubmitResponse {
  success: boolean;
  questionId: string;
  factAdded?: boolean;
  nextSuggestions?: Array<{
    questionId: string;
    suggestedAnswer: string;
    confidence: number;
  }>;
}

export interface ProgressResponse {
  projectId: string;
  totalQuestions: number;
  answeredCount: number;
  skippedCount: number;
  completionPercentage: number;
  sectionProgress: Record<string, { answered: number; total: number }>;
}

export interface ChatSession {
  sessionId: string;
  projectId: string;
  createdAt: string;
  lastActivityAt: string;
  messageCount: number;
  documentsUploaded: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ChatResponse {
  message: ChatMessage;
  suggestions?: string[];
  extractedFacts?: Array<{ key: string; value: string; confidence: number }>;
}

export interface DocumentUploadResponse {
  success: boolean;
  documentId: string;
  filename: string;
  factsExtracted: number;
  gapCount: number;
  extractedProtocol?: Record<string, unknown>;
}

export interface CoherenceStatus {
  projectId: string;
  coherenceScore: number;
  totalRulesChecked: number;
  rulesPassed: number;
  rulesFailed: number;
  conflictsError: number;
  conflictsWarning: number;
  conflictsInfo: number;
  totalConflicts: number;
  hasBlockingIssues: boolean;
  readyForSubmission: boolean;
  topIssues: string[];
  lastCheckedAt: string;
}

export interface Conflict {
  conflictId: string;
  projectId: string;
  ruleId: string;
  ruleName: string;
  severity: 'error' | 'warning' | 'info';
  factKey: string;
  description: string;
  values: Record<string, unknown>;
  sources: string[];
  status: 'active' | 'resolved' | 'deferred' | 'overridden';
  resolutionOptions: string[];
  resolvedBy?: string;
  resolvedAt?: string;
  resolution?: string;
  resolutionValue?: string;
  resolutionNote?: string;
  detectedAt: string;
}

export interface ResolveConflictRequest {
  resolution: 'adopt_source_value' | 'adopt_form_value' | 'mark_intentional_difference' | 'provide_new_value' | 'defer';
  value?: unknown;
  note?: string;
  propagate?: boolean;
}

export interface KnowledgeStats {
  projectId: string;
  factsCount: number;
  documentsCount: number;
  wizardAnswersCount: number;
  completionPercentage: number;
  lastUpdated: string;
}

export interface FormFillPreview {
  formId: string;
  templateName: string;
  fieldsFilled: number;
  totalFields: number;
  fields: Array<{
    fieldId: string;
    fieldLabel: string;
    suggestedValue: string;
    confidence: number;
    source: string;
  }>;
}

export interface GeneratedDocument {
  id: string;
  type: string;
  name: string;
  content?: string;
  downloadUrl?: string;
  generatedAt: string;
}

// ============================================================================
// Session Management
// ============================================================================

export async function getOrCreateSession(projectId: string): Promise<ChatSession> {
  const response = await api.post('/protocol-assistant/sessions', { project_id: projectId });
  // Gateway wraps response in { success, data }, extract the inner data
  const data = response.data.data || response.data;
  return {
    sessionId: data.session_id,
    projectId: data.project_id,
    createdAt: data.created_at,
    lastActivityAt: data.updated_at || data.created_at,
    messageCount: 0,
    documentsUploaded: 0,
  };
}

export async function getSession(sessionId: string): Promise<ChatSession> {
  const response = await api.get(`/protocol-assistant/sessions/${sessionId}`);
  // Gateway wraps response in { success, data }, extract the inner data
  const data = response.data.data || response.data;
  return {
    sessionId: data.session_id,
    projectId: data.project_id,
    createdAt: data.created_at,
    lastActivityAt: data.updated_at || data.created_at,
    messageCount: 0,
    documentsUploaded: 0,
  };
}

export async function closeSession(sessionId: string): Promise<void> {
  await api.post(`/protocol-assistant/sessions/${sessionId}/close`);
}

// ============================================================================
// Chat Operations
// ============================================================================

export async function getChatHistory(
  sessionId: string,
  limit = 50,
  offset = 0
): Promise<{ messages: ChatMessage[]; total: number }> {
  const response = await api.get(`/protocol-assistant/sessions/${sessionId}/history`, {
    params: { limit, offset },
  });
  return response.data;
}

export async function sendChatMessage(
  sessionId: string,
  content: string
): Promise<ChatResponse> {
  const response = await api.post(`/protocol-assistant/sessions/${sessionId}/chat`, {
    content,
  });
  return response.data;
}

export async function streamChatMessage(
  sessionId: string,
  content: string,
  onChunk: (chunk: string) => void,
  onComplete: (response: ChatResponse) => void,
  onError: (error: Error) => void
): Promise<void> {
  try {
    const response = await fetch(`${API_BASE}/protocol-assistant/sessions/${sessionId}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
      },
      body: JSON.stringify({ content }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      fullContent += chunk;
      onChunk(chunk);
    }

    onComplete({
      message: {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: fullContent,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    onError(error instanceof Error ? error : new Error('Stream failed'));
  }
}

// ============================================================================
// Document Operations
// ============================================================================

export async function uploadDocument(
  sessionId: string,
  file: File
): Promise<DocumentUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post(
    `/protocol-assistant/sessions/${sessionId}/documents/upload`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000, // 2 minute timeout for large files
    }
  );
  return response.data;
}

export async function uploadKnowledgeDocument(
  projectId: string,
  file: File,
  docType?: string,
  extractFacts = true
): Promise<DocumentUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (docType) formData.append('doc_type', docType);
  formData.append('extract_facts', String(extractFacts));

  const response = await api.post(
    `/projects/${projectId}/documents`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    }
  );
  // Gateway wraps response in { success, data }, extract inner data
  const data = response.data.data || response.data;
  return {
    success: data.success ?? true,
    documentId: data.document_id || data.documentId || '',
    filename: data.filename || file.name,
    factsExtracted: data.facts_extracted ?? data.factsExtracted ?? 0,
    gapCount: data.gap_count ?? data.gapCount ?? 0,
    extractedProtocol: data.extracted_protocol || data.extractedProtocol,
  };
}

export async function getDocuments(
  sessionId: string
): Promise<Array<{ id: string; filename: string; type: string; uploadedAt: string }>> {
  const response = await api.get(`/protocol-assistant/sessions/${sessionId}/documents`);
  return response.data;
}

// ============================================================================
// Guided Mode (Questionnaire)
// ============================================================================

export async function getQuestionnaire(projectId: string): Promise<QuestionnaireResponse> {
  const response = await api.get(`/projects/${projectId}/questionnaire`);
  // Gateway wraps response in { success, data }, extract the inner data
  const data = response.data.data || response.data;

  // Transform sections and questions from snake_case to camelCase
  // Backend uses 'key' for section identifier, not 'id'
  const sections: Section[] = (data.sections || []).map((section: Record<string, unknown>) => {
    const sectionId = (section.key || section.id) as string;
    return {
      id: sectionId,
      name: section.name as string,
      description: section.description as string | undefined,
      questions: ((section.questions || []) as Record<string, unknown>[]).map((q) => ({
        id: q.id as string,
        question: q.question as string,
        section: sectionId,
      priority: (q.priority || 'medium') as Question['priority'],
      answerType: (q.answer_type || q.answerType || 'text') as Question['answerType'],
      options: q.options as string[] | undefined,
      rationale: (q.rationale || q.why_needed) as string | undefined,
      whyNeeded: (q.why_needed || q.whyNeeded) as string | undefined,
      usedInForms: (q.used_in_forms || q.usedInForms) as string[] | undefined,
      protocolField: (q.protocol_field || q.protocolField) as string | undefined,
      suggestedAnswer: (q.suggested_answer || q.suggestedAnswer) as string | undefined,
      // Backend uses suggestion_confidence/suggestion_source (not suggested_answer_*)
      suggestedAnswerConfidence: (q.suggestion_confidence || q.suggestionConfidence || q.suggested_answer_confidence) as number | undefined,
      suggestedAnswerSource: (q.suggestion_source || q.suggestionSource || q.suggested_answer_source) as string | undefined,
    })),
    };
  });

  return {
    projectId: data.project_id || projectId,
    sections,
    estimatedMinutes: data.estimated_minutes || data.estimatedMinutes || 15,
    projectType: data.project_type || data.projectType,
  };
}

export async function submitAnswer(
  projectId: string,
  questionId: string,
  answer: string | number | boolean | string[],
  source: string = 'wizard'
): Promise<AnswerSubmitResponse> {
  const response = await api.post(`/projects/${projectId}/questionnaire/answer`, {
    question_id: questionId,
    answer,
    source,
  });
  return response.data;
}

export async function skipQuestion(
  projectId: string,
  questionId: string
): Promise<ProgressResponse> {
  const response = await api.post(`/projects/${projectId}/questionnaire/skip/${questionId}`);
  return response.data;
}

export async function getQuestionnaireProgress(projectId: string): Promise<ProgressResponse> {
  const response = await api.get(`/projects/${projectId}/questionnaire/progress`);
  return response.data;
}

export async function getQuestionSuggestions(
  sessionId: string,
  questionId: string
): Promise<Array<{ value: string; confidence: number; source: string }>> {
  try {
    const response = await api.get(
      `/protocol-assistant/sessions/${sessionId}/wizard/questions/${questionId}/suggestions`
    );
    const data = response.data.data || response.data;
    return data.suggestions || [];
  } catch {
    // Suggestions are optional - return empty array if endpoint unavailable
    return [];
  }
}

export async function resetQuestionnaire(projectId: string): Promise<{ success: boolean }> {
  const response = await api.post(`/projects/${projectId}/questionnaire/reset`);
  return response.data;
}

// ============================================================================
// Coherence Operations
// ============================================================================

export async function getCoherenceStatus(projectId: string): Promise<CoherenceStatus> {
  const response = await api.get(`/coherence/projects/${projectId}/status`);
  // Handle wrapped response or direct response
  const data = response.data.data || response.data;
  return {
    projectId: data.project_id || projectId,
    coherenceScore: data.coherence_score ?? data.coherenceScore ?? 100,
    totalRulesChecked: data.total_rules_checked ?? data.totalRulesChecked ?? 0,
    rulesPassed: data.rules_passed ?? data.rulesPassed ?? 0,
    rulesFailed: data.rules_failed ?? data.rulesFailed ?? 0,
    conflictsError: data.conflicts_error ?? data.conflictsError ?? 0,
    conflictsWarning: data.conflicts_warning ?? data.conflictsWarning ?? 0,
    conflictsInfo: data.conflicts_info ?? data.conflictsInfo ?? 0,
    totalConflicts: data.total_conflicts ?? data.totalConflicts ?? 0,
    hasBlockingIssues: data.has_blocking_issues ?? data.hasBlockingIssues ?? false,
    readyForSubmission: data.ready_for_submission ?? data.readyForSubmission ?? true,
    topIssues: data.top_issues || data.topIssues || [],
    lastCheckedAt: data.last_checked_at || data.lastCheckedAt || new Date().toISOString(),
  };
}

export async function triggerCoherenceValidation(projectId: string): Promise<CoherenceStatus> {
  const response = await api.post(`/coherence/projects/${projectId}/validate`);
  return response.data;
}

export async function getConflicts(
  projectId: string,
  status?: 'active' | 'resolved' | 'deferred' | 'overridden'
): Promise<Conflict[]> {
  const response = await api.get(`/coherence/projects/${projectId}/conflicts`, {
    params: status ? { status } : undefined,
  });
  return response.data;
}

export async function getConflict(projectId: string, conflictId: string): Promise<Conflict> {
  const response = await api.get(`/coherence/projects/${projectId}/conflicts/${conflictId}`);
  return response.data;
}

export async function resolveConflict(
  projectId: string,
  conflictId: string,
  resolution: ResolveConflictRequest
): Promise<Conflict> {
  const response = await api.post(
    `/coherence/projects/${projectId}/conflicts/${conflictId}/resolve`,
    resolution
  );
  return response.data;
}

export async function checkRealtimeCoherence(
  projectId: string,
  factKey: string,
  newValue: unknown,
  source: string
): Promise<{ conflicts: Conflict[]; checkedInMs: number }> {
  const response = await api.post(`/coherence/projects/${projectId}/check-realtime`, {
    fact_key: factKey,
    new_value: newValue,
    source,
  });
  return response.data;
}

// Aliases for convenience
export async function getCoherenceConflicts(projectId: string): Promise<{
  conflicts: Array<{
    id: string;
    rule_id: string;
    severity: 'error' | 'warning' | 'info';
    description: string;
    fact_key: string;
    conflicting_values: Array<{
      source: string;
      value: string;
      document?: string;
    }>;
    resolution_options: string[];
    status: 'detected' | 'acknowledged' | 'resolved' | 'ignored';
    detected_at: string;
  }>;
}> {
  const conflicts = await getConflicts(projectId, 'active');
  return {
    conflicts: conflicts.map((c) => ({
      id: c.conflictId,
      rule_id: c.ruleId,
      severity: c.severity,
      description: c.description,
      fact_key: c.factKey,
      conflicting_values: c.sources.map((s, i) => ({
        source: s,
        value: String(c.values[s] || Object.values(c.values)[i] || ''),
      })),
      resolution_options: c.resolutionOptions,
      status: c.status === 'active' ? 'detected' : c.status === 'resolved' ? 'resolved' : 'detected',
      detected_at: c.detectedAt,
    })),
  };
}

export async function triggerCoherenceCheck(projectId: string): Promise<CoherenceStatus> {
  return triggerCoherenceValidation(projectId);
}

// ============================================================================
// Knowledge Base Operations
// ============================================================================

export async function getKnowledgeStats(projectId: string): Promise<KnowledgeStats> {
  const response = await api.get(`/projects/${projectId}/knowledge/stats`);
  return response.data;
}

export async function searchKnowledge(
  projectId: string,
  query: string,
  topK = 5
): Promise<Array<{ key: string; value: string; confidence: number; source: string }>> {
  const response = await api.post(`/projects/${projectId}/knowledge/search`, {
    query,
    top_k: topK,
  });
  return response.data.results || [];
}

export async function addFact(
  projectId: string,
  key: string,
  value: string,
  source: string,
  confidence = 1.0
): Promise<{ success: boolean; factId: string }> {
  const response = await api.post(`/projects/${projectId}/knowledge/facts`, {
    key,
    value,
    source,
    confidence,
  });
  return response.data;
}

// ============================================================================
// Form Fill Operations
// ============================================================================

export async function getFormFillPreview(
  projectId: string,
  templateId?: string
): Promise<FormFillPreview> {
  const response = await api.get(`/projects/${projectId}/form-fill/preview`, {
    params: templateId ? { template_id: templateId } : undefined,
  });
  return response.data;
}

export async function fillForm(
  projectId: string,
  formId: string,
  options?: { overwriteExisting?: boolean }
): Promise<{ success: boolean; fieldsFilled: number; formUrl?: string }> {
  const response = await api.post(`/projects/${projectId}/form-fill`, {
    form_id: formId,
    ...options,
  });
  return response.data;
}

export async function recordCorrection(
  formId: string,
  fieldId: string,
  originalValue: unknown,
  correctedValue: unknown,
  kbKey?: string
): Promise<{ success: boolean }> {
  const response = await api.post(`/forms/${formId}/corrections`, {
    field_id: fieldId,
    original_value: originalValue,
    corrected_value: correctedValue,
    kb_key: kbKey,
  });
  return response.data;
}

// ============================================================================
// Document Generation
// ============================================================================

// Document type configuration
// Maps frontend type -> URL path, display name, and backend doc_type
const documentTypeConfig: Record<string, { urlPath: string; displayName: string }> = {
  abstract: { urlPath: 'abstract', displayName: 'Research Abstract' },
  consent_form: { urlPath: 'consent', displayName: 'Informed Consent Form' },
  protocol: { urlPath: 'protocol', displayName: 'Protocol Document' },
  recruitment_materials: { urlPath: 'recruitment', displayName: 'Recruitment Materials' },
  data_management_plan: { urlPath: 'data-management', displayName: 'Data Management Plan' },
};

export type DocumentType = 'abstract' | 'consent_form' | 'protocol' | 'recruitment_materials' | 'data_management_plan';

export async function generateDocument(
  sessionId: string,
  documentType: DocumentType
): Promise<GeneratedDocument> {
  const config = documentTypeConfig[documentType];
  const urlPath = config?.urlPath || documentType;

  const response = await api.post(
    `/protocol-assistant/sessions/${sessionId}/generate/${urlPath}`,
    {},
    { timeout: 180000 } // 3 minute timeout for generation
  );

  // Handle gateway wrapper: { success: true, data: ... }
  const backendDoc = response.data?.data || response.data;

  // Transform backend response to frontend GeneratedDocument format
  // Backend returns: doc_type, content, word_count, quality_score, suggestions, generation_metadata
  // Frontend expects: id, type, name, content, downloadUrl, generatedAt
  return {
    id: `${documentType}-${Date.now()}`, // Generate unique ID
    type: backendDoc.doc_type || documentType, // Use backend doc_type which matches our type
    name: config?.displayName || documentType,
    content: typeof backendDoc.content === 'object'
      ? JSON.stringify(backendDoc.content, null, 2)
      : backendDoc.content,
    generatedAt: new Date().toISOString(),
    // downloadUrl would be added if we have a download endpoint
  };
}

export async function getGeneratedDocuments(
  sessionId: string
): Promise<GeneratedDocument[]> {
  const response = await api.get(`/protocol-assistant/sessions/${sessionId}/documents/generated`);
  return response.data;
}

// ============================================================================
// Real-time Events (SSE)
// ============================================================================

export function subscribeToProjectEvents(
  projectId: string,
  onEvent: (event: { type: string; data: unknown }) => void,
  onError?: (error: Event) => void
): EventSource {
  const token = localStorage.getItem('accessToken');
  const eventSource = new EventSource(
    `${API_BASE}/events/projects/${projectId}/stream?token=${token}`
  );

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onEvent(data);
    } catch {
      console.error('Failed to parse SSE event:', event.data);
    }
  };

  eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    onError?.(error);
  };

  return eventSource;
}

// ============================================================================
// Export default client
// ============================================================================

export default {
  // Session
  getOrCreateSession,
  getSession,
  closeSession,
  // Chat
  getChatHistory,
  sendChatMessage,
  streamChatMessage,
  // Documents
  uploadDocument,
  uploadKnowledgeDocument,
  getDocuments,
  // Questionnaire
  getQuestionnaire,
  submitAnswer,
  skipQuestion,
  getQuestionnaireProgress,
  getQuestionSuggestions,
  resetQuestionnaire,
  // Coherence
  getCoherenceStatus,
  triggerCoherenceValidation,
  triggerCoherenceCheck, // alias
  getConflicts,
  getCoherenceConflicts, // alias with transformed response
  getConflict,
  resolveConflict,
  checkRealtimeCoherence,
  // Knowledge
  getKnowledgeStats,
  searchKnowledge,
  addFact,
  // Form Fill
  getFormFillPreview,
  fillForm,
  recordCorrection,
  // Generation
  generateDocument,
  getGeneratedDocuments,
  // Events
  subscribeToProjectEvents,
};
