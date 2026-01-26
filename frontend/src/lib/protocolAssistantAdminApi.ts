/**
 * Protocol Assistant Admin API client.
 *
 * Provides functions for admin operations including:
 * - Analytics and metrics
 * - Prompt management and A/B testing
 * - Knowledge base management
 * - Feature flag management
 * - Quality monitoring
 */

import { api } from './api';

// Types
export interface UsageAnalytics {
  period: {
    start_date: string;
    end_date: string;
  };
  summary: {
    total_sessions: number;
    total_messages: number;
    total_generations: number;
    unique_users: number;
    avg_session_duration_minutes: number;
  };
}

export interface QualityMetrics {
  period: {
    start_date: string;
    end_date: string;
  };
  metrics: {
    avg_rating: number;
    rating_count: number;
    success_rate: number;
    by_task_type: Record<string, { avg_rating: number; count: number }>;
  };
}

export interface CostAnalytics {
  period: {
    start_date: string;
    end_date: string;
  };
  costs: {
    total_cost: number;
    by_provider: Record<string, number>;
    by_task: Record<string, number>;
    projected_monthly: number;
  };
}

export interface DailyTrend {
  date: string;
  sessions: number;
  messages: number;
  generations: number;
  avg_rating: number;
  cost: number;
}

export interface PromptVersion {
  id: number;
  prompt_key: string;
  version: number;
  name: string | null;
  content: string;
  is_active: boolean;
  is_default: boolean;
  traffic_percentage: number;
  success_rate: number | null;
  avg_quality_score: number | null;
  sample_count: number;
  created_at: string;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  content?: string;
  category: string;
  description: string | null;
  is_active: boolean;
  word_count: number | null;
  created_at: string;
}

export interface FeatureFlag {
  name: string;
  description: string | null;
  category: string | null;
  is_enabled: boolean;
  rollout_percentage: number;
  effective_value?: boolean;
}

export interface QualityStatus {
  avg_rating: number;
  rating_count: number;
  success_rate: number;
  low_rating_count: number;
  status: 'healthy' | 'warning' | 'degraded' | 'critical';
  trend: 'improving' | 'stable' | 'declining';
  baseline_rating: number;
  deviation_percentage: number;
}

export interface FeedbackEntry {
  id: string;
  rating: number;
  feedback_type: string;
  comment: string | null;
  issue_category: string | null;
  created_at: string;
}

// API Functions
export const protocolAssistantAdminApi = {
  // Analytics
  getUsageAnalytics: async (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    return api.get<UsageAnalytics>(`/protocol-assistant/admin/analytics/usage?${params}`);
  },

  getQualityMetrics: async (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    return api.get<QualityMetrics>(`/protocol-assistant/admin/analytics/quality?${params}`);
  },

  getCostAnalytics: async (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    return api.get<CostAnalytics>(`/protocol-assistant/admin/analytics/costs?${params}`);
  },

  getDailyTrends: async (startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);
    return api.get<{ trends: DailyTrend[] }>(`/protocol-assistant/admin/analytics/trends?${params}`);
  },

  // Prompts
  getPromptKeys: async () => {
    return api.get<{ prompt_keys: string[] }>('/protocol-assistant/admin/prompts/keys');
  },

  getPromptVersions: async (promptKey: string, includeInactive = true) => {
    return api.get<{ prompt_key: string; versions: PromptVersion[] }>(
      `/protocol-assistant/admin/prompts/${promptKey}/versions?include_inactive=${includeInactive}`
    );
  },

  createPromptVersion: async (data: {
    prompt_key: string;
    content: string;
    name?: string;
    description?: string;
    system_prompt?: string;
    parameters?: Record<string, unknown>;
  }) => {
    return api.post<PromptVersion>('/protocol-assistant/admin/prompts', data);
  },

  activatePrompt: async (versionId: number, trafficPercentage = 100) => {
    return api.post(`/protocol-assistant/admin/prompts/versions/${versionId}/activate`, {
      traffic_percentage: trafficPercentage,
    });
  },

  deactivatePrompt: async (versionId: number) => {
    return api.post(`/protocol-assistant/admin/prompts/versions/${versionId}/deactivate`);
  },

  comparePromptVersions: async (versionA: number, versionB: number) => {
    return api.get(`/protocol-assistant/admin/prompts/compare/${versionA}/${versionB}`);
  },

  // Knowledge Base
  getKnowledgeCategories: async () => {
    return api.get<{ categories: string[] }>('/protocol-assistant/admin/knowledge/categories');
  },

  getKnowledgeStats: async () => {
    return api.get<{
      total_documents: number;
      total_words: number;
      by_category: Record<string, number>;
      categories_count: number;
    }>('/protocol-assistant/admin/knowledge/stats');
  },

  searchKnowledge: async (query: string, category?: string, limit = 10) => {
    const params = new URLSearchParams({ query, limit: String(limit) });
    if (category) params.append('category', category);
    return api.get<{ query: string; results: KnowledgeDocument[] }>(
      `/protocol-assistant/admin/knowledge/search?${params}`
    );
  },

  addKnowledgeDocument: async (data: {
    title: string;
    content: string;
    category: string;
    description?: string;
    source_url?: string;
    tags?: string[];
    is_public?: boolean;
  }) => {
    return api.post<KnowledgeDocument>('/protocol-assistant/admin/knowledge', data);
  },

  getKnowledgeDocument: async (documentId: string) => {
    return api.get<KnowledgeDocument & { content: string }>(
      `/protocol-assistant/admin/knowledge/${documentId}`
    );
  },

  deleteKnowledgeDocument: async (documentId: string, hardDelete = false) => {
    return api.delete(`/protocol-assistant/admin/knowledge/${documentId}?hard_delete=${hardDelete}`);
  },

  // Feature Flags
  getFeatureFlags: async (category?: string) => {
    const params = category ? `?category=${category}` : '';
    return api.get<{ flags: Record<string, boolean> }>(
      `/protocol-assistant/admin/feature-flags${params}`
    );
  },

  getFeatureFlag: async (flagName: string) => {
    return api.get<FeatureFlag>(`/protocol-assistant/admin/feature-flags/${flagName}`);
  },

  updateFeatureFlag: async (
    flagName: string,
    data: { is_enabled: boolean; rollout_percentage?: number; reason?: string }
  ) => {
    return api.put(`/protocol-assistant/admin/feature-flags/${flagName}`, data);
  },

  setInstitutionOverride: async (
    flagName: string,
    institutionId: string,
    data: { is_enabled: boolean; reason?: string; expires_at?: string }
  ) => {
    return api.put(
      `/protocol-assistant/admin/feature-flags/${flagName}/institution/${institutionId}`,
      data
    );
  },

  removeInstitutionOverride: async (flagName: string, institutionId: string, reason?: string) => {
    const params = reason ? `?reason=${encodeURIComponent(reason)}` : '';
    return api.delete(
      `/protocol-assistant/admin/feature-flags/${flagName}/institution/${institutionId}${params}`
    );
  },

  // Quality Monitoring
  getQualityStatus: async (promptKey?: string, hours = 24) => {
    const params = new URLSearchParams({ hours: String(hours) });
    if (promptKey) params.append('prompt_key', promptKey);
    return api.get<{ metrics: QualityStatus }>(`/protocol-assistant/admin/quality/status?${params}`);
  },

  getQualityTrends: async (promptKey?: string, days = 7) => {
    const params = new URLSearchParams({ days: String(days) });
    if (promptKey) params.append('prompt_key', promptKey);
    return api.get<{ trends: Array<{ date: string; avg_rating: number; feedback_count: number }> }>(
      `/protocol-assistant/admin/quality/trends?${params}`
    );
  },

  checkAndRollback: async (promptKey: string) => {
    return api.post(`/protocol-assistant/admin/quality/check-rollback?prompt_key=${promptKey}`);
  },

  manualRollback: async (promptKey: string, reason?: string) => {
    return api.post('/protocol-assistant/admin/quality/manual-rollback', {
      prompt_key: promptKey,
      reason,
    });
  },

  getQualityAlerts: async (limit = 20) => {
    return api.get<{
      alerts: Array<{
        type: string;
        severity: string;
        message: string;
        details: Record<string, unknown>;
        prompt_key: string | null;
        created_at: string;
      }>;
    }>(`/protocol-assistant/admin/quality/alerts?limit=${limit}`);
  },

  // Feedback
  getFeedbackSummary: async (days = 30, promptVersionId?: number) => {
    const params = new URLSearchParams({ days: String(days) });
    if (promptVersionId) params.append('prompt_version_id', String(promptVersionId));
    return api.get(`/protocol-assistant/admin/feedback/summary?${params}`);
  },

  getLowRatedOutputs: async (threshold = 2, days = 30, limit = 50) => {
    return api.get<{ count: number; feedbacks: FeedbackEntry[] }>(
      `/protocol-assistant/admin/feedback/low-rated?threshold=${threshold}&days=${days}&limit=${limit}`
    );
  },

  getCommonIssues: async (days = 30, minOccurrences = 3) => {
    return api.get<{ issues: Array<{ category: string; count: number; examples: string[] }> }>(
      `/protocol-assistant/admin/feedback/issues?days=${days}&min_occurrences=${minOccurrences}`
    );
  },
};

export default protocolAssistantAdminApi;
