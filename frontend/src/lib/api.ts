import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_URL}/auth/refresh`, {
          refreshToken,
        });

        const { accessToken, refreshToken: newRefreshToken } = response.data.data;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', newRefreshToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to login
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// API methods
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: { email: string; password: string; fullName: string }) =>
    api.post('/auth/register', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  refresh: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
};

export const projectsApi = {
  list: () => api.get('/projects'),
  get: (id: string) => api.get(`/projects/${id}`),
  create: (data: any) => api.post('/projects', data),
  update: (id: string, data: any) => api.put(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  getCollaborators: (id: string) => api.get(`/projects/${id}/collaborators`),
  addCollaborator: (id: string, data: any) =>
    api.post(`/projects/${id}/collaborators`, data),
};

export const templatesApi = {
  list: () => api.get('/templates'),
  get: (id: number) => api.get(`/templates/${id}`),
};

export const formsApi = {
  list: (params?: { projectId?: string; status?: string }) =>
    api.get('/forms', { params }),
  get: (id: number) => api.get(`/forms/${id}`),
  create: (data: { template_id: number; project_id?: string; title: string }) =>
    api.post('/forms', data),
  updateData: (id: number, data: any) => api.post(`/forms/${id}/data`, data),
  delete: (id: number) => api.delete(`/forms/${id}`),
  getVersions: (id: number) => api.get(`/forms/${id}/versions`),
  createVersion: (id: number, label?: string) =>
    api.post(`/forms/${id}/versions`, { label }),
  downloadDocument: (id: number, format: 'docx' | 'pdf', versionId?: number) =>
    api.get(`/forms/${id}/${format}`, {
      params: { version_id: versionId },
      responseType: 'blob',
    }),
  generateDocuments: (id: number, versionId?: number) =>
    api.post(`/forms/${id}/generate`, { version_id: versionId }),
  downloadDocx: (id: number, versionId?: number) =>
    api.get(`/forms/${id}/docx`, {
      params: { version_id: versionId },
      responseType: 'blob',
    }),
  downloadPdf: (id: number, versionId?: number) =>
    api.get(`/forms/${id}/pdf`, {
      params: { version_id: versionId },
      responseType: 'blob',
    }),
  // Review actions (routes are under /review prefix)
  submitForReview: (id: number, notes?: string) =>
    api.post(`/review/forms/${id}/submit`, { notes }),
  requestChanges: (id: number, notes: string) =>
    api.post(`/review/forms/${id}/request-changes`, { notes }),
  approve: (id: number, notes?: string) =>
    api.post(`/review/forms/${id}/approve`, { notes }),
  reject: (id: number, notes: string) =>
    api.post(`/review/forms/${id}/reject`, { notes }),
  returnToDraft: (id: number, notes?: string) =>
    api.post(`/review/forms/${id}/return-to-draft`, { notes }),
  getReviewHistory: (id: number) => api.get(`/review/forms/${id}/history`),
  // Comments (routes are under /review prefix)
  getComments: (id: number, includeResolved?: boolean) =>
    api.get(`/review/forms/${id}/comments`, { params: { include_resolved: includeResolved } }),
  addComment: (id: number, data: { content: string; field_id?: string; section_id?: string }) =>
    api.post(`/review/forms/${id}/comments`, data),
  // Audit
  getAuditLog: (id: number, params?: any) => api.get(`/forms/${id}/audit`, { params }),
  getFieldHistory: (id: number, fieldId: string) => api.get(`/forms/${id}/audit/field/${fieldId}`),
};

export const reviewApi = {
  getQueue: (status?: string) => api.get('/review/queue', { params: status ? { status } : {} }),
  resolveThread: (threadId: number) => api.post(`/review/threads/${threadId}/resolve`),
  reopenThread: (threadId: number) => api.post(`/review/threads/${threadId}/reopen`),
  replyToThread: (threadId: number, content: string) =>
    api.post(`/review/threads/${threadId}/reply`, { content }),
  getMentionableUsers: (formId: number) => api.get(`/review/forms/${formId}/mentionable-users`),
};

export interface LockInfo {
  is_locked: boolean;
  lock_id?: number;
  locked_by_id?: string;
  locked_by_name?: string;
  expires_at?: string;
  created_at?: string;
}

export interface LockAcquireResponse {
  success: boolean;
  lock_id?: number;
  expires_at?: string;
  extended?: boolean;
  error?: string;
  locked_by_id?: string;
}

export const locksApi = {
  acquireLock: (formId: number, sectionId?: string, durationMinutes: number = 5) =>
    api.post<LockAcquireResponse>(`/forms/${formId}/lock`, {
      section_id: sectionId,
      duration_minutes: durationMinutes,
    }),
  releaseLock: (formId: number, sectionId?: string) =>
    api.delete(`/forms/${formId}/lock`, { params: { section_id: sectionId } }),
  checkLock: (formId: number, sectionId?: string) =>
    api.get<LockInfo>(`/forms/${formId}/lock`, { params: { section_id: sectionId } }),
  getAllLocks: (formId: number) =>
    api.get<{ form_id: number; locks: LockInfo[] }>(`/forms/${formId}/locks`),
  extendLock: (formId: number, sectionId?: string, durationMinutes: number = 5) =>
    api.post<LockAcquireResponse>(`/forms/${formId}/lock/extend`, {
      section_id: sectionId,
      duration_minutes: durationMinutes,
    }),
  forceReleaseLock: (formId: number, sectionId?: string) =>
    api.post(`/forms/${formId}/lock/force-release`, { section_id: sectionId }),
  acquireSectionLock: (formId: number, sectionId: string, durationMinutes: number = 5) =>
    api.post<LockAcquireResponse>(`/forms/${formId}/sections/${sectionId}/lock`, null, {
      params: { duration_minutes: durationMinutes },
    }),
  releaseSectionLock: (formId: number, sectionId: string) =>
    api.delete(`/forms/${formId}/sections/${sectionId}/lock`),
  checkSectionLock: (formId: number, sectionId: string) =>
    api.get<LockInfo>(`/forms/${formId}/sections/${sectionId}/lock`),
};

export const tasksApi = {
  list: () => api.get('/tasks'),
  get: (id: number) => api.get(`/tasks/${id}`),
  create: (data: any) => api.post('/tasks', data),
  update: (id: number, data: any) => api.put(`/tasks/${id}`, data),
  complete: (id: number) => api.post(`/tasks/${id}/complete`),
};

export const notificationsApi = {
  list: (params?: { page?: number; limit?: number }) =>
    api.get('/notifications', { params }),
  markAsRead: (id: number) => api.post(`/notifications/${id}/read`),
  markAllAsRead: () => api.post('/notifications/read-all'),
  delete: (id: number) => api.delete(`/notifications/${id}`),
  getUnreadCount: () => api.get('/notifications/unread-count'),
};

export interface UsersListParams {
  page?: number;
  limit?: number;
  role?: string;
  is_active?: boolean;
  search?: string;
}

export interface CreateUserData {
  email: string;
  password: string;
  full_name: string;
  role?: string;
  is_active?: boolean;
}

export interface UpdateUserData {
  full_name?: string;
  role?: string;
  is_active?: boolean;
}

export const usersApi = {
  list: (params?: UsersListParams) => api.get('/admin/users', { params }),
  get: (id: string) => api.get(`/admin/users/${id}`),
  create: (data: CreateUserData) => api.post('/admin/users', data),
  update: (id: string, data: UpdateUserData) => api.put(`/admin/users/${id}`, data),
  deactivate: (id: string) => api.delete(`/admin/users/${id}`),
  resetPassword: (id: string) => api.post(`/admin/users/${id}/reset-password`),
  unlock: (id: string) => api.post(`/admin/users/${id}/unlock`),
};

// File categories
export type FileCategory = 'proposal' | 'irb_document' | 'consent_form' | 'protocol' | 'data' | 'result' | 'other';

export interface FileUploadParams {
  file: File;
  project_id?: string;
  form_id?: number;
  category?: FileCategory;
}

export interface FileMetadata {
  id: string;
  original_file_name: string;
  file_size: number;
  mime_type: string;
  category: FileCategory;
  uploaded_by: {
    id: string;
    name: string;
    email: string;
  };
  project_id?: string;
  form_instance_id?: number;
  created_at: string;
}

export const filesApi = {
  upload: (params: FileUploadParams, onUploadProgress?: (progressEvent: any) => void) => {
    const formData = new FormData();
    formData.append('file', params.file);
    if (params.project_id) formData.append('project_id', params.project_id);
    if (params.form_id) formData.append('form_id', params.form_id.toString());
    if (params.category) formData.append('category', params.category);

    return api.post('/files', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    });
  },
  download: (id: string) => api.get(`/files/${id}`, { responseType: 'blob' }),
  getMetadata: (id: string) => api.get<{ success: boolean; data: FileMetadata }>(`/files/${id}/metadata`),
  delete: (id: string) => api.delete(`/files/${id}`),
  listProjectFiles: (projectId: string, params?: { page?: number; limit?: number }) =>
    api.get<{ success: boolean; data: FileMetadata[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(`/projects/${projectId}/files`, { params }),
  listFormFiles: (formId: number, params?: { page?: number; limit?: number }) =>
    api.get<{ success: boolean; data: FileMetadata[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>(`/forms/${formId}/files`, { params }),
};

// Search types
export type SearchResultType = 'project' | 'form' | 'user' | 'file';

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  description?: string;
  subtitle?: string;
  link: string;
  rank: number;
  created_at: string;
}

export interface QuickSearchResult {
  projects?: SearchResult[];
  forms?: SearchResult[];
  users?: SearchResult[];
  files?: SearchResult[];
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const searchApi = {
  search: (query: string, type: string = 'all', page: number = 1, limit: number = 20) =>
    api.get<PaginatedResponse<SearchResult[]>>('/search', {
      params: { q: query, type, page, limit },
    }),
  quickSearch: (query: string) =>
    api.get<{ success: boolean; data: QuickSearchResult }>('/search/quick', {
      params: { q: query },
    }),
};

// Activity feed types
export interface ActivityItem {
  id: number;
  actor: {
    id: string | null;
    name: string | null;
    email: string | null;
  };
  action: string;
  action_label: string;
  description: string;
  resource_type: string;
  resource_type_label: string;
  resource_id: string | null;
  resource_link: string | null;
  details: Record<string, unknown> | null;
  timestamp: string;
  source: 'audit_log' | 'field_change';
  icon: string;
  icon_color: string;
}

export interface ActivityListParams {
  page?: number;
  limit?: number;
  action?: string;
  resource_type?: string;
  start_date?: string;
  end_date?: string;
}

export interface ActivityResponse {
  success: boolean;
  data: ActivityItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const activityApi = {
  // Global activity (admin only)
  getGlobal: (params?: ActivityListParams) =>
    api.get<ActivityResponse>('/activity', { params }),
  // Current user's own activity
  getMy: (params?: ActivityListParams) =>
    api.get<ActivityResponse>('/activity/me', { params }),
  // Project activity
  getProject: (projectId: string, params?: ActivityListParams) =>
    api.get<ActivityResponse>(`/projects/${projectId}/activity`, { params }),
  // Form activity
  getForm: (formId: number, params?: ActivityListParams) =>
    api.get<ActivityResponse>(`/forms/${formId}/activity`, { params }),
  // User activity (admin only)
  getUser: (userId: string, params?: ActivityListParams) =>
    api.get<ActivityResponse>(`/admin/users/${userId}/activity`, { params }),
};

// Amendment types
export type AmendmentType =
  | 'protocol_change'
  | 'personnel_change'
  | 'funding_change'
  | 'site_change'
  | 'procedure_change'
  | 'consent_update'
  | 'other';

export type AmendmentStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'withdrawn';

export interface Amendment {
  id: number;
  form_instance_id: number;
  amendment_type: AmendmentType;
  status: AmendmentStatus;
  description?: string;
  submitted_at?: string;
  submitted_by_id?: string;
  reviewed_at?: string;
  reviewed_by_id?: string;
  review_notes?: string;
  created_at: string;
  created_by_id: string;
  field_changes_count?: number;
}

export interface AmendmentFieldChange {
  id: number;
  amendment_id: number;
  field_id: string;
  field_label?: string;
  old_value?: any;
  new_value?: any;
  justification?: string;
}

export interface AmendmentWithChanges extends Amendment {
  field_changes: AmendmentFieldChange[];
}

export const amendmentsApi = {
  // List amendments for a form
  list: (formId: number, status?: AmendmentStatus) =>
    api.get(`/forms/${formId}/amendments`, { params: status ? { status } : {} }),

  // Create a new amendment
  create: (formId: number, data: { amendment_type: AmendmentType; description?: string }) =>
    api.post(`/forms/${formId}/amendments`, data),

  // Get amendment details
  get: (amendmentId: number) =>
    api.get(`/amendments/${amendmentId}`),

  // Update a draft amendment
  update: (amendmentId: number, data: { amendment_type?: AmendmentType; description?: string }) =>
    api.put(`/amendments/${amendmentId}`, data),

  // Delete a draft amendment
  delete: (amendmentId: number) =>
    api.delete(`/amendments/${amendmentId}`),

  // Add a field change
  addChange: (amendmentId: number, data: {
    field_id: string;
    field_label?: string;
    old_value?: any;
    new_value?: any;
    justification?: string;
  }) =>
    api.post(`/amendments/${amendmentId}/changes`, data),

  // Update a field change
  updateChange: (amendmentId: number, changeId: number, data: {
    field_label?: string;
    old_value?: any;
    new_value?: any;
    justification?: string;
  }) =>
    api.put(`/amendments/${amendmentId}/changes/${changeId}`, data),

  // Remove a field change
  removeChange: (amendmentId: number, changeId: number) =>
    api.delete(`/amendments/${amendmentId}/changes/${changeId}`),

  // Submit for review
  submit: (amendmentId: number) =>
    api.post(`/amendments/${amendmentId}/submit`),

  // Approve (reviewer only)
  approve: (amendmentId: number, notes?: string) =>
    api.post(`/amendments/${amendmentId}/approve`, { notes }),

  // Reject (reviewer only)
  reject: (amendmentId: number, notes: string) =>
    api.post(`/amendments/${amendmentId}/reject`, { notes }),

  // Withdraw (owner only)
  withdraw: (amendmentId: number) =>
    api.post(`/amendments/${amendmentId}/withdraw`),
};

// =============================================================================
// Review Stages Types and API
// =============================================================================

export interface ReviewStage {
  id: number;
  code: string;
  name: string;
  description?: string;
  sequence_order: number;
  default_deadline_days: number;
  requires_all_previous: boolean;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface StageReviewInfo {
  stage_id: number;
  stage_code: string;
  stage_name: string;
  sequence_order: number;
  review_id?: number;
  reviewer_id?: string;
  reviewer_name?: string;
  status: string; // not_started, pending, assigned, in_progress, approved, rejected, revision_required
  deadline?: string;
  started_at?: string;
  completed_at?: string;
  overall_comments?: string;
}

export interface ReviewProgressResponse {
  form_id: number;
  form_title: string;
  form_status: string;
  current_stage_id?: number;
  current_stage_name?: string;
  stages: StageReviewInfo[];
  completed_stages: number;
  total_stages: number;
  progress_percentage: number;
}

export interface ReviewStageCreateData {
  code: string;
  name: string;
  description?: string;
  sequence_order: number;
  default_deadline_days?: number;
  requires_all_previous?: boolean;
  is_active?: boolean;
}

export interface ReviewStageUpdateData {
  code?: string;
  name?: string;
  description?: string;
  sequence_order?: number;
  default_deadline_days?: number;
  requires_all_previous?: boolean;
  is_active?: boolean;
}

export interface StageAssignmentData {
  reviewer_id: string;
  deadline?: string;
}

export interface StageCompletionData {
  status: 'approved' | 'rejected' | 'revision_required';
  comments?: string;
}

// =============================================================================
// Reports API (Admin Only)
// =============================================================================

export interface OverviewMetrics {
  totalUsers: number;
  activeUsers: number;
  totalProjects: number;
  activeProjects: number;
  totalForms: number;
  formsInReview: number;
  totalTasks: number;
  pendingTasks: number;
}

export interface ChartDataPoint {
  name: string;
  value: number;
}

export interface TopResearcher {
  userId: string;
  fullName: string;
  email: string;
  formsCreated: number;
  formsApproved: number;
  projectsCount: number;
}

export interface DepartmentStat {
  department: string;
  projectsCount: number;
  formsCount: number;
}

export interface ReviewMetrics {
  totalReviews: number;
  avgReviewTimeHours: number | null;
  approvalRate: number;
  rejectionRate: number;
  revisionRate: number;
}

export interface MonthlySubmission {
  month: string;
  submitted: number;
  approved: number;
  rejected: number;
}

export interface ActivityTrend {
  date: string;
  forms: number;
  reviews: number;
  logins: number;
}

export const reportsApi = {
  // GET /api/admin/reports/overview
  getOverview: () =>
    api.get<{ success: boolean; data: { metrics: OverviewMetrics; generatedAt: string } }>(
      '/admin/reports/overview'
    ),

  // GET /api/admin/reports/projects-by-type
  getProjectsByType: () =>
    api.get<{ success: boolean; data: ChartDataPoint[] }>('/admin/reports/projects-by-type'),

  // GET /api/admin/reports/projects-by-status
  getProjectsByStatus: () =>
    api.get<{ success: boolean; data: ChartDataPoint[] }>('/admin/reports/projects-by-status'),

  // GET /api/admin/reports/forms-by-status
  getFormsByStatus: () =>
    api.get<{ success: boolean; data: ChartDataPoint[] }>('/admin/reports/forms-by-status'),

  // GET /api/admin/reports/forms-by-template
  getFormsByTemplate: () =>
    api.get<{ success: boolean; data: ChartDataPoint[] }>('/admin/reports/forms-by-template'),

  // GET /api/admin/reports/tasks-by-status
  getTasksByStatus: () =>
    api.get<{ success: boolean; data: ChartDataPoint[] }>('/admin/reports/tasks-by-status'),

  // GET /api/admin/reports/tasks-by-priority
  getTasksByPriority: () =>
    api.get<{ success: boolean; data: ChartDataPoint[] }>('/admin/reports/tasks-by-priority'),

  // GET /api/admin/reports/activity-trends
  getActivityTrends: (startDate?: string, endDate?: string, interval?: 'day' | 'week' | 'month') =>
    api.get<{ success: boolean; data: ActivityTrend[]; meta: { startDate: string; endDate: string; interval: string } }>(
      '/admin/reports/activity-trends',
      { params: { start_date: startDate, end_date: endDate, interval } }
    ),

  // GET /api/admin/reports/top-researchers
  getTopResearchers: (limit?: number) =>
    api.get<{ success: boolean; data: TopResearcher[] }>(
      '/admin/reports/top-researchers',
      { params: { limit } }
    ),

  // GET /api/admin/reports/department-stats
  getDepartmentStats: () =>
    api.get<{ success: boolean; data: DepartmentStat[] }>('/admin/reports/department-stats'),

  // GET /api/admin/reports/review-metrics
  getReviewMetrics: () =>
    api.get<{ success: boolean; data: ReviewMetrics }>('/admin/reports/review-metrics'),

  // GET /api/admin/reports/monthly-submissions
  getMonthlySubmissions: (months?: number) =>
    api.get<{ success: boolean; data: MonthlySubmission[] }>(
      '/admin/reports/monthly-submissions',
      { params: { months } }
    ),

  // GET /api/admin/reports/users-by-role
  getUsersByRole: () =>
    api.get<{ success: boolean; data: ChartDataPoint[] }>('/admin/reports/users-by-role'),
};

// Email API for admin email management
export const emailApi = {
  // GET /api/admin/email/config - Get current email configuration
  getConfig: () =>
    api.get<{ success: boolean; data: any }>('/admin/email/config'),

  // POST /api/admin/email/test - Send a test email
  testEmail: (email: string) =>
    api.post<{ success: boolean; message: string; data?: { messageId: string } }>(
      '/admin/email/test',
      { email }
    ),

  // POST /api/admin/email/verify - Verify email server connection
  verifyConnection: () =>
    api.post<{ success: boolean; message: string; data: { connected: boolean } }>(
      '/admin/email/verify'
    ),
};

export const reviewStagesApi = {
  // Admin - Stage Management
  list: (activeOnly: boolean = true) =>
    api.get('/admin/review-stages', { params: { active_only: activeOnly } }),

  get: (stageId: number) =>
    api.get(`/admin/review-stages/${stageId}`),

  create: (data: ReviewStageCreateData) =>
    api.post('/admin/review-stages', data),

  update: (stageId: number, data: ReviewStageUpdateData) =>
    api.put(`/admin/review-stages/${stageId}`, data),

  delete: (stageId: number) =>
    api.delete(`/admin/review-stages/${stageId}`),

  reorder: (stageIds: number[]) =>
    api.post('/admin/review-stages/reorder', { stage_ids: stageIds }),

  // Form Review Progress
  getFormProgress: (formId: number) =>
    api.get(`/review/forms/${formId}/stages`),

  // Stage Actions
  assignReviewer: (formId: number, stageId: number, data: StageAssignmentData) =>
    api.post(`/review/forms/${formId}/stages/${stageId}/assign`, data),

  startStageReview: (formId: number, stageId: number) =>
    api.post(`/review/forms/${formId}/stages/${stageId}/start`),

  completeStage: (formId: number, stageId: number, data: StageCompletionData) =>
    api.post(`/review/forms/${formId}/stages/${stageId}/complete`, data),

  advanceToNextStage: (formId: number, reviewerId?: string) =>
    api.post(`/review/forms/${formId}/advance`, { reviewer_id: reviewerId }),
};

export default api;
