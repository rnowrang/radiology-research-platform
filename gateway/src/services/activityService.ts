import {
  activityQueries,
  ActivityItem,
  PaginationParams,
  ActivityFilters,
} from '../database/queries/activityQueries.js';
import { logger } from '../utils/logger.js';

export type ActivityType = 'global' | 'project' | 'form' | 'user';

// Human-readable action descriptions
const ACTION_DESCRIPTIONS: Record<string, string> = {
  login: 'logged in',
  logout: 'logged out',
  login_failed: 'failed to log in',
  create: 'created',
  read: 'viewed',
  update: 'updated',
  delete: 'deleted',
  download: 'downloaded',
  upload: 'uploaded',
  approve: 'approved',
  reject: 'rejected',
  submit: 'submitted',
  export: 'exported',
  password_change: 'changed password',
  password_reset: 'reset password',
  // Review actions
  submit_for_review: 'submitted for review',
  request_changes: 'requested changes on',
  return_to_draft: 'returned to draft',
  // Collaboration actions
  comment_added: 'commented on',
  comment_resolved: 'resolved comment on',
};

// Resource type labels
const RESOURCE_TYPE_LABELS: Record<string, string> = {
  user: 'user',
  project: 'project',
  form_instance: 'form',
  template: 'template',
  file: 'file',
  project_collaborator: 'project collaborator',
  form_collaborator: 'form collaborator',
  comment: 'comment',
  review: 'review',
  field_change: 'field',
};

// Icons for different activity types (for frontend reference)
export const ACTIVITY_ICONS: Record<string, string> = {
  login: 'log-in',
  logout: 'log-out',
  login_failed: 'alert-circle',
  create: 'plus',
  read: 'eye',
  update: 'edit',
  delete: 'trash-2',
  download: 'download',
  upload: 'upload',
  approve: 'check-circle',
  reject: 'x-circle',
  submit: 'send',
  export: 'file-down',
  password_change: 'key',
  password_reset: 'refresh-cw',
  submit_for_review: 'send',
  request_changes: 'message-circle',
  return_to_draft: 'rotate-ccw',
  comment_added: 'message-square',
  comment_resolved: 'check-square',
};

// Icon colors for different actions
export const ACTIVITY_COLORS: Record<string, string> = {
  login: 'text-green-500',
  logout: 'text-gray-500',
  login_failed: 'text-red-500',
  create: 'text-blue-500',
  read: 'text-gray-500',
  update: 'text-yellow-500',
  delete: 'text-red-500',
  download: 'text-purple-500',
  upload: 'text-purple-500',
  approve: 'text-green-500',
  reject: 'text-red-500',
  submit: 'text-blue-500',
  export: 'text-purple-500',
  password_change: 'text-orange-500',
  password_reset: 'text-orange-500',
  submit_for_review: 'text-blue-500',
  request_changes: 'text-yellow-500',
  return_to_draft: 'text-gray-500',
  comment_added: 'text-purple-500',
  comment_resolved: 'text-green-500',
};

export interface FormattedActivityItem {
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
  relative_time?: string;
  source: 'audit_log' | 'field_change';
  icon: string;
  icon_color: string;
}

/**
 * Format a raw activity item for display
 */
export const formatActivityItem = (raw: ActivityItem): FormattedActivityItem => {
  const actorName = raw.actor_name || raw.actor_email || 'Unknown user';
  const actionLabel = ACTION_DESCRIPTIONS[raw.action] || raw.action;
  const resourceTypeLabel = RESOURCE_TYPE_LABELS[raw.resource_type] || raw.resource_type;

  // Build description
  let description = `${actorName} ${actionLabel}`;
  if (raw.resource_type !== 'user' && raw.resource_id) {
    description += ` ${resourceTypeLabel}`;

    // Add resource name from details if available
    if (raw.details) {
      const name = raw.details.title || raw.details.name || raw.details.field_label;
      if (name) {
        description += ` "${name}"`;
      }
    }
  }

  // Determine resource link
  let resourceLink: string | null = null;
  if (raw.resource_id) {
    switch (raw.resource_type) {
      case 'project':
        resourceLink = `/projects/${raw.resource_id}`;
        break;
      case 'form_instance':
        resourceLink = `/forms/${raw.resource_id}`;
        break;
      case 'template':
        resourceLink = `/templates/${raw.resource_id}`;
        break;
      case 'user':
        resourceLink = `/admin/users/${raw.resource_id}`;
        break;
      case 'file':
        resourceLink = `/files/${raw.resource_id}`;
        break;
    }
  }

  return {
    id: raw.id,
    actor: {
      id: raw.actor_id,
      name: raw.actor_name,
      email: raw.actor_email,
    },
    action: raw.action,
    action_label: actionLabel,
    description,
    resource_type: raw.resource_type,
    resource_type_label: resourceTypeLabel,
    resource_id: raw.resource_id,
    resource_link: resourceLink,
    details: raw.details,
    timestamp: raw.timestamp.toISOString(),
    source: raw.source,
    icon: ACTIVITY_ICONS[raw.action] || 'activity',
    icon_color: ACTIVITY_COLORS[raw.action] || 'text-muted-foreground',
  };
};

/**
 * Get activity feed based on type and resource ID
 */
export const getActivityFeed = async (
  type: ActivityType,
  resourceId: string | number | null,
  pagination: PaginationParams = { page: 1, limit: 20 },
  filters: ActivityFilters = {}
): Promise<{
  activities: FormattedActivityItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> => {
  try {
    let result: { activities: ActivityItem[]; total: number };

    switch (type) {
      case 'global':
        result = await activityQueries.getGlobalActivity(pagination, filters);
        break;
      case 'project':
        if (!resourceId || typeof resourceId !== 'string') {
          throw new Error('Project ID is required for project activity');
        }
        result = await activityQueries.getProjectActivity(resourceId, pagination, filters);
        break;
      case 'form':
        if (!resourceId) {
          throw new Error('Form ID is required for form activity');
        }
        const formId = typeof resourceId === 'string' ? parseInt(resourceId, 10) : resourceId;
        result = await activityQueries.getFormActivity(formId, pagination, filters);
        break;
      case 'user':
        if (!resourceId || typeof resourceId !== 'string') {
          throw new Error('User ID is required for user activity');
        }
        result = await activityQueries.getUserActivity(resourceId, pagination, filters);
        break;
      default:
        throw new Error(`Unknown activity type: ${type}`);
    }

    const formattedActivities = result.activities.map(formatActivityItem);

    return {
      activities: formattedActivities,
      total: result.total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(result.total / pagination.limit),
    };
  } catch (error) {
    logger.error('Failed to get activity feed', { type, resourceId, error });
    throw error;
  }
};

export const activityService = {
  formatActivityItem,
  getActivityFeed,
  ACTIVITY_ICONS,
  ACTIVITY_COLORS,
};

export default activityService;
