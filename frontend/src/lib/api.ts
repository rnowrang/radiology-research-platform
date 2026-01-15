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

        const { accessToken, refreshToken: newRefreshToken } = response.data;
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
  list: () => api.get('/forms/templates'),
  get: (id: number) => api.get(`/forms/templates/${id}`),
};

export const formsApi = {
  list: (params?: { projectId?: string; status?: string }) =>
    api.get('/forms', { params }),
  get: (id: number) => api.get(`/forms/${id}`),
  create: (data: { templateId: number; projectId?: string; title: string }) =>
    api.post('/forms', data),
  updateData: (id: number, data: any) => api.post(`/forms/${id}/data`, data),
  delete: (id: number) => api.delete(`/forms/${id}`),
  getVersions: (id: number) => api.get(`/forms/${id}/versions`),
  createVersion: (id: number, data: { label?: string; summary?: string }) =>
    api.post(`/forms/${id}/versions`, data),
  generateDocuments: (id: number, versionId?: number) =>
    api.post(`/forms/${id}/export`, { versionId }),
  downloadDocument: (id: number, format: 'docx' | 'pdf', versionId?: number) =>
    api.get(`/forms/${id}/download/${format}`, {
      params: { versionId },
      responseType: 'blob',
    }),
  submitForReview: (id: number) => api.post(`/forms/${id}/submit`),
};

export const reviewApi = {
  getQueue: () => api.get('/review/queue'),
  getFormReview: (formId: number) => api.get(`/review/forms/${formId}`),
  approve: (formId: number, comments?: string) =>
    api.post(`/review/forms/${formId}/approve`, { comments }),
  reject: (formId: number, comments: string) =>
    api.post(`/review/forms/${formId}/reject`, { comments }),
  requestChanges: (formId: number, comments: string) =>
    api.post(`/review/forms/${formId}/request-changes`, { comments }),
  addComment: (formId: number, data: { fieldId?: string; content: string }) =>
    api.post(`/review/forms/${formId}/comments`, data),
};

export const tasksApi = {
  list: () => api.get('/tasks'),
  get: (id: number) => api.get(`/tasks/${id}`),
  create: (data: any) => api.post('/tasks', data),
  update: (id: number, data: any) => api.put(`/tasks/${id}`, data),
  complete: (id: number) => api.post(`/tasks/${id}/complete`),
};

export const notificationsApi = {
  list: () => api.get('/notifications'),
  markRead: (id: number) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
};

export default api;
