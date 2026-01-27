/**
 * Learning API Client
 *
 * Provides functions for:
 * - User learning profile management
 * - Correction tracking
 * - Suggestion feedback
 * - Fact provenance
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
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// =============================================================================
// Types
// =============================================================================

export interface UserLearningProfile {
  id: string;
  patterns: Record<string, any>;
  common_values: Record<string, { values: Record<string, number>; count: number }>;
  preferences: Record<string, any>;
  total_corrections: number;
  total_accepted_suggestions: number;
}

export interface Correction {
  id: string;
  user_id: string;
  project_id?: string;
  field_key: string;
  form_field_id?: string;
  original_value?: string;
  corrected_value: string;
  correction_source: string;
  suggestion_confidence?: number;
  suggestion_source?: string;
  applied_to_learning: boolean;
  created_at: string;
}

export interface CorrectionPatterns {
  [fieldKey: string]: {
    correction_count: number;
    avg_original_confidence?: number;
  };
}

export interface FeedbackStats {
  accepted: number;
  rejected: number;
  modified: number;
  ignored: number;
  total: number;
  acceptance_rate: number;
}

export interface FactProvenance {
  id: string;
  project_id: string;
  fact_key: string;
  current_value?: string;
  primary_source: string;
  source_document_id?: string;
  source_reference?: string;
  confidence: number;
  verified_by_user: boolean;
  verified_at?: string;
  referenced_by: Array<{ type: string; id: string; field?: string }>;
  version: number;
  previous_value?: string;
  created_at: string;
  updated_at: string;
}

export interface FactHistoryEntry {
  id: string;
  version: number;
  value?: string;
  source: string;
  confidence?: number;
  changed_by_user_id?: string;
  change_reason?: string;
  created_at: string;
}

export interface LearningContext {
  user_patterns: Record<string, any>;
  user_preferences: Record<string, any>;
  common_values: Record<string, number>;
  recent_corrections: Record<string, number>;
  correction_count: number;
  acceptance_rate: number;
}

// =============================================================================
// User Profile
// =============================================================================

export async function getMyProfile(): Promise<UserLearningProfile> {
  const response = await api.get('/learning/profile');
  return response.data;
}

export async function getCommonValues(
  fieldKey?: string
): Promise<{ common_values: Record<string, any> }> {
  const response = await api.get('/learning/profile/common-values', {
    params: fieldKey ? { field_key: fieldKey } : undefined,
  });
  return response.data;
}

// =============================================================================
// Corrections
// =============================================================================

export async function recordCorrection(params: {
  field_key: string;
  corrected_value: string;
  original_value?: string;
  project_id?: string;
  form_field_id?: string;
  source?: 'form_fill' | 'questionnaire' | 'document_mode' | 'review_mode';
  suggestion_confidence?: number;
  suggestion_source?: string;
}): Promise<{ id: string; success: boolean }> {
  const response = await api.post('/learning/corrections', {
    field_key: params.field_key,
    corrected_value: params.corrected_value,
    original_value: params.original_value,
    project_id: params.project_id,
    form_field_id: params.form_field_id,
    source: params.source || 'form_fill',
    suggestion_confidence: params.suggestion_confidence,
    suggestion_source: params.suggestion_source,
  });
  return response.data;
}

export async function getCorrections(params?: {
  field_key?: string;
  project_id?: string;
  limit?: number;
}): Promise<{ corrections: Correction[]; count: number }> {
  const response = await api.get('/learning/corrections', {
    params: {
      field_key: params?.field_key,
      project_id: params?.project_id,
      limit: params?.limit,
    },
  });
  return response.data;
}

export async function getCorrectionPatterns(
  fieldKey?: string
): Promise<{ patterns: CorrectionPatterns }> {
  const response = await api.get('/learning/corrections/patterns', {
    params: fieldKey ? { field_key: fieldKey } : undefined,
  });
  return response.data;
}

// =============================================================================
// Feedback
// =============================================================================

export async function recordFeedback(params: {
  suggestion_type: string;
  feedback: 'accepted' | 'rejected' | 'modified' | 'ignored';
  field_key?: string;
  suggested_value?: string;
  final_value?: string;
  project_id?: string;
  suggestion_confidence?: number;
  suggestion_source?: string;
}): Promise<{ id: string; success: boolean }> {
  const response = await api.post('/learning/feedback', params);
  return response.data;
}

export async function getFeedbackStats(
  suggestionType?: string
): Promise<FeedbackStats> {
  const response = await api.get('/learning/feedback/stats', {
    params: suggestionType ? { suggestion_type: suggestionType } : undefined,
  });
  return response.data;
}

// =============================================================================
// Provenance
// =============================================================================

export async function updateProvenance(
  projectId: string,
  params: {
    fact_key: string;
    value: string;
    source: 'document_extraction' | 'wizard_answer' | 'user_input' | 'form_sync' | 'ai_suggestion';
    confidence?: number;
    source_document_id?: string;
    source_reference?: string;
    change_reason?: string;
  }
): Promise<{ id: string; success: boolean }> {
  const response = await api.post(`/learning/projects/${projectId}/provenance`, {
    ...params,
    confidence: params.confidence ?? 1.0,
  });
  return response.data;
}

export async function getProvenance(
  projectId: string,
  factKey: string
): Promise<FactProvenance> {
  const response = await api.get(
    `/learning/projects/${projectId}/provenance/${factKey}`
  );
  return response.data;
}

export async function getFactHistory(
  projectId: string,
  factKey: string,
  limit?: number
): Promise<{ history: FactHistoryEntry[]; count: number }> {
  const response = await api.get(
    `/learning/projects/${projectId}/provenance/${factKey}/history`,
    {
      params: limit ? { limit } : undefined,
    }
  );
  return response.data;
}

export async function addFactReference(
  projectId: string,
  params: {
    fact_key: string;
    reference_type: string;
    reference_id: string;
    field?: string;
  }
): Promise<{ success: boolean }> {
  const response = await api.post(
    `/learning/projects/${projectId}/provenance/reference`,
    params
  );
  return response.data;
}

export async function verifyFact(
  projectId: string,
  factKey: string
): Promise<{ success: boolean }> {
  const response = await api.post(
    `/learning/projects/${projectId}/provenance/${factKey}/verify`
  );
  return response.data;
}

// =============================================================================
// Learning Context
// =============================================================================

export async function getLearningContext(
  fieldKey: string
): Promise<LearningContext> {
  const response = await api.get(`/learning/context/${fieldKey}`);
  return response.data;
}

// =============================================================================
// Export default
// =============================================================================

export default {
  // Profile
  getMyProfile,
  getCommonValues,
  // Corrections
  recordCorrection,
  getCorrections,
  getCorrectionPatterns,
  // Feedback
  recordFeedback,
  getFeedbackStats,
  // Provenance
  updateProvenance,
  getProvenance,
  getFactHistory,
  addFactReference,
  verifyFact,
  // Context
  getLearningContext,
};
