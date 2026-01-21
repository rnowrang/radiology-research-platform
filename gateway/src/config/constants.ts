export const USER_ROLES = {
  ADMIN: 'admin',
  REVIEWER: 'reviewer',
  RESEARCHER: 'researcher',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

export const FORM_STATUS = {
  DRAFT: 'draft',
  IN_REVIEW: 'in_review',
  NEEDS_CHANGES: 'needs_changes',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  LOCKED: 'locked',
} as const;

export type FormStatus = typeof FORM_STATUS[keyof typeof FORM_STATUS];

export const PROJECT_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;

export type ProjectStatus = typeof PROJECT_STATUS[keyof typeof PROJECT_STATUS];

export const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
  CANCELLED: 'cancelled',
} as const;

export type TaskStatus = typeof TASK_STATUS[keyof typeof TASK_STATUS];

export const AUDIT_ACTIONS = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  LOGIN_FAILED: 'login_failed',
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  DOWNLOAD: 'download',
  UPLOAD: 'upload',
  APPROVE: 'approve',
  REJECT: 'reject',
  SUBMIT: 'submit',
  EXPORT: 'export',
  PASSWORD_CHANGE: 'password_change',
  PASSWORD_RESET: 'password_reset',
} as const;

export type AuditAction = typeof AUDIT_ACTIONS[keyof typeof AUDIT_ACTIONS];

export const NOTIFICATION_TYPES = {
  APPROVAL_REQUEST: 'approval_request',
  STATUS_CHANGE: 'status_change',
  COMMENT: 'comment',
  REMINDER: 'reminder',
  MENTION: 'mention',
  TASK_ASSIGNED: 'task_assigned',
  SYSTEM: 'system',
} as const;

export type NotificationType = typeof NOTIFICATION_TYPES[keyof typeof NOTIFICATION_TYPES];
