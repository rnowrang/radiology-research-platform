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
      null,
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
};
