import { Request } from 'express';
import { UserRole, FormStatus, ProjectStatus, TaskStatus } from '../config/constants.js';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
  sessionId?: string;
}

export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  sessionId: string;
}

export interface Project {
  id: string;
  title: string;
  description?: string;
  project_type?: string;
  department?: string;
  principal_investigator_id: string;
  status: ProjectStatus;
  start_date?: Date;
  end_date?: Date;
  is_public: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Task {
  id: number;
  project_id?: string;
  form_instance_id?: number;
  assigned_to_id?: string;
  created_by_id: string;
  title: string;
  description?: string;
  task_type?: string;
  status: TaskStatus;
  priority: string;
  due_date?: Date;
  completed_at?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Notification {
  id: number;
  user_id: string;
  type: string;
  title: string;
  message?: string;
  link?: string;
  is_read: boolean;
  created_at: Date;
}

export interface AuditLog {
  id: number;
  user_id?: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  ip_address?: string;
  user_agent?: string;
  details?: Record<string, unknown>;
  session_id?: string;
  success: boolean;
  created_at: Date;
}

export interface Session {
  id: string;
  user_id: string;
  session_token: string;
  refresh_token: string;
  ip_address?: string;
  user_agent?: string;
  expires_at: Date;
  is_revoked: boolean;
  created_at: Date;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
