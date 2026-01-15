import { query } from '../connection.js';

export interface ActivityItem {
  id: number;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  timestamp: Date;
  source: 'audit_log' | 'field_change';
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface ActivityFilters {
  action?: string;
  resource_type?: string;
  start_date?: Date;
  end_date?: Date;
}

/**
 * Get global activity feed (for admins)
 */
export const getGlobalActivity = async (
  pagination: PaginationParams = { page: 1, limit: 20 },
  filters: ActivityFilters = {}
): Promise<{ activities: ActivityItem[]; total: number }> => {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.action) {
    conditions.push(`a.action = $${paramIndex}`);
    values.push(filters.action);
    paramIndex++;
  }

  if (filters.resource_type) {
    conditions.push(`a.resource_type = $${paramIndex}`);
    values.push(filters.resource_type);
    paramIndex++;
  }

  if (filters.start_date) {
    conditions.push(`a.created_at >= $${paramIndex}`);
    values.push(filters.start_date);
    paramIndex++;
  }

  if (filters.end_date) {
    conditions.push(`a.created_at <= $${paramIndex}`);
    values.push(filters.end_date);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [activitiesResult, countResult] = await Promise.all([
    query<ActivityItem>(
      `SELECT
        a.id,
        a.user_id as actor_id,
        u.full_name as actor_name,
        u.email as actor_email,
        a.action,
        a.resource_type,
        a.resource_id,
        a.details,
        a.created_at as timestamp,
        'audit_log' as source
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM audit_logs a ${whereClause}`,
      values
    ),
  ]);

  return {
    activities: activitiesResult.rows,
    total: parseInt(countResult.rows[0]?.count || '0', 10),
  };
};

/**
 * Get activity for a specific project
 */
export const getProjectActivity = async (
  projectId: string,
  pagination: PaginationParams = { page: 1, limit: 20 },
  filters: ActivityFilters = {}
): Promise<{ activities: ActivityItem[]; total: number }> => {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const conditions: string[] = [
    `(
      (a.resource_type = 'project' AND a.resource_id = $1)
      OR (a.resource_type = 'form_instance' AND a.resource_id IN (
        SELECT id::text FROM form_instances WHERE project_id = $1::uuid
      ))
      OR (a.resource_type = 'project_collaborator' AND a.resource_id = $1)
      OR (a.resource_type = 'file' AND a.resource_id IN (
        SELECT id::text FROM files WHERE project_id = $1::uuid
      ))
    )`,
  ];
  const values: unknown[] = [projectId];
  let paramIndex = 2;

  if (filters.action) {
    conditions.push(`a.action = $${paramIndex}`);
    values.push(filters.action);
    paramIndex++;
  }

  if (filters.resource_type) {
    conditions.push(`a.resource_type = $${paramIndex}`);
    values.push(filters.resource_type);
    paramIndex++;
  }

  if (filters.start_date) {
    conditions.push(`a.created_at >= $${paramIndex}`);
    values.push(filters.start_date);
    paramIndex++;
  }

  if (filters.end_date) {
    conditions.push(`a.created_at <= $${paramIndex}`);
    values.push(filters.end_date);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const [activitiesResult, countResult] = await Promise.all([
    query<ActivityItem>(
      `SELECT
        a.id,
        a.user_id as actor_id,
        u.full_name as actor_name,
        u.email as actor_email,
        a.action,
        a.resource_type,
        a.resource_id,
        a.details,
        a.created_at as timestamp,
        'audit_log' as source
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM audit_logs a ${whereClause}`,
      values
    ),
  ]);

  return {
    activities: activitiesResult.rows,
    total: parseInt(countResult.rows[0]?.count || '0', 10),
  };
};

/**
 * Get activity for a specific form
 */
export const getFormActivity = async (
  formId: number,
  pagination: PaginationParams = { page: 1, limit: 20 },
  filters: ActivityFilters = {}
): Promise<{ activities: ActivityItem[]; total: number }> => {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  // Combine audit_logs and field_changes for complete form activity
  const conditions: string[] = [];
  const values: unknown[] = [formId.toString()];
  let paramIndex = 2;

  if (filters.action) {
    conditions.push(`action = $${paramIndex}`);
    values.push(filters.action);
    paramIndex++;
  }

  if (filters.start_date) {
    conditions.push(`timestamp >= $${paramIndex}`);
    values.push(filters.start_date);
    paramIndex++;
  }

  if (filters.end_date) {
    conditions.push(`timestamp <= $${paramIndex}`);
    values.push(filters.end_date);
    paramIndex++;
  }

  const additionalConditions = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

  // Union query to combine audit_logs and field_changes
  const combinedQuery = `
    WITH combined_activity AS (
      SELECT
        a.id,
        a.user_id as actor_id,
        u.full_name as actor_name,
        u.email as actor_email,
        a.action,
        a.resource_type,
        a.resource_id,
        a.details,
        a.created_at as timestamp,
        'audit_log' as source
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      WHERE a.resource_type = 'form_instance' AND a.resource_id = $1

      UNION ALL

      SELECT
        fc.id,
        fc.user_id as actor_id,
        u.full_name as actor_name,
        u.email as actor_email,
        fc.action_type as action,
        'field_change' as resource_type,
        fc.field_id as resource_id,
        jsonb_build_object(
          'field_label', fc.field_label,
          'old_value', fc.old_value,
          'new_value', fc.new_value
        ) as details,
        fc.created_at as timestamp,
        'field_change' as source
      FROM field_changes fc
      LEFT JOIN users u ON fc.user_id = u.id
      WHERE fc.form_instance_id = $1::integer
    )
    SELECT * FROM combined_activity
    WHERE 1=1 ${additionalConditions}
    ORDER BY timestamp DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;

  const countQuery = `
    WITH combined_activity AS (
      SELECT a.id, a.action, a.created_at as timestamp
      FROM audit_logs a
      WHERE a.resource_type = 'form_instance' AND a.resource_id = $1

      UNION ALL

      SELECT fc.id, fc.action_type as action, fc.created_at as timestamp
      FROM field_changes fc
      WHERE fc.form_instance_id = $1::integer
    )
    SELECT COUNT(*) as count FROM combined_activity
    WHERE 1=1 ${additionalConditions}
  `;

  const [activitiesResult, countResult] = await Promise.all([
    query<ActivityItem>(combinedQuery, [...values, limit, offset]),
    query<{ count: string }>(countQuery, values),
  ]);

  return {
    activities: activitiesResult.rows,
    total: parseInt(countResult.rows[0]?.count || '0', 10),
  };
};

/**
 * Get activity for a specific user
 */
export const getUserActivity = async (
  userId: string,
  pagination: PaginationParams = { page: 1, limit: 20 },
  filters: ActivityFilters = {}
): Promise<{ activities: ActivityItem[]; total: number }> => {
  const { page, limit } = pagination;
  const offset = (page - 1) * limit;

  const conditions: string[] = ['a.user_id = $1'];
  const values: unknown[] = [userId];
  let paramIndex = 2;

  if (filters.action) {
    conditions.push(`a.action = $${paramIndex}`);
    values.push(filters.action);
    paramIndex++;
  }

  if (filters.resource_type) {
    conditions.push(`a.resource_type = $${paramIndex}`);
    values.push(filters.resource_type);
    paramIndex++;
  }

  if (filters.start_date) {
    conditions.push(`a.created_at >= $${paramIndex}`);
    values.push(filters.start_date);
    paramIndex++;
  }

  if (filters.end_date) {
    conditions.push(`a.created_at <= $${paramIndex}`);
    values.push(filters.end_date);
    paramIndex++;
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const [activitiesResult, countResult] = await Promise.all([
    query<ActivityItem>(
      `SELECT
        a.id,
        a.user_id as actor_id,
        u.full_name as actor_name,
        u.email as actor_email,
        a.action,
        a.resource_type,
        a.resource_id,
        a.details,
        a.created_at as timestamp,
        'audit_log' as source
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    ),
    query<{ count: string }>(
      `SELECT COUNT(*) as count FROM audit_logs a ${whereClause}`,
      values
    ),
  ]);

  return {
    activities: activitiesResult.rows,
    total: parseInt(countResult.rows[0]?.count || '0', 10),
  };
};

export const activityQueries = {
  getGlobalActivity,
  getProjectActivity,
  getFormActivity,
  getUserActivity,
};

export default activityQueries;
