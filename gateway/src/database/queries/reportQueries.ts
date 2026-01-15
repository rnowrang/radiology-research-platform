import { query } from '../connection.js';

interface MetricResult {
  count: string;
}

interface GroupedResult {
  name: string;
  count: string;
}

interface TimeSeriesResult {
  period: string;
  count: string;
}

interface ResearcherResult {
  user_id: string;
  full_name: string;
  email: string;
  forms_created: string;
  forms_approved: string;
  projects_count: string;
}

interface DepartmentResult {
  department: string;
  projects_count: string;
  forms_count: string;
}

interface ReviewMetricsResult {
  total_reviews: string;
  avg_review_time_hours: string | null;
  approved_count: string;
  rejected_count: string;
  revision_required_count: string;
}

export const reportQueries = {
  // Get overview metrics (total counts)
  getOverviewMetrics: async (): Promise<{
    totalUsers: number;
    activeUsers: number;
    totalProjects: number;
    activeProjects: number;
    totalForms: number;
    formsInReview: number;
    totalTasks: number;
    pendingTasks: number;
  }> => {
    const [
      usersResult,
      activeUsersResult,
      projectsResult,
      activeProjectsResult,
      formsResult,
      formsInReviewResult,
      tasksResult,
      pendingTasksResult,
    ] = await Promise.all([
      query<MetricResult>('SELECT COUNT(*) as count FROM users'),
      query<MetricResult>('SELECT COUNT(*) as count FROM users WHERE is_active = true'),
      query<MetricResult>('SELECT COUNT(*) as count FROM projects'),
      query<MetricResult>("SELECT COUNT(*) as count FROM projects WHERE status = 'active'"),
      query<MetricResult>('SELECT COUNT(*) as count FROM form_instances'),
      query<MetricResult>("SELECT COUNT(*) as count FROM form_instances WHERE status = 'in_review'"),
      query<MetricResult>('SELECT COUNT(*) as count FROM tasks'),
      query<MetricResult>("SELECT COUNT(*) as count FROM tasks WHERE status = 'pending'"),
    ]);

    return {
      totalUsers: parseInt(usersResult.rows[0]?.count || '0', 10),
      activeUsers: parseInt(activeUsersResult.rows[0]?.count || '0', 10),
      totalProjects: parseInt(projectsResult.rows[0]?.count || '0', 10),
      activeProjects: parseInt(activeProjectsResult.rows[0]?.count || '0', 10),
      totalForms: parseInt(formsResult.rows[0]?.count || '0', 10),
      formsInReview: parseInt(formsInReviewResult.rows[0]?.count || '0', 10),
      totalTasks: parseInt(tasksResult.rows[0]?.count || '0', 10),
      pendingTasks: parseInt(pendingTasksResult.rows[0]?.count || '0', 10),
    };
  },

  // Get projects grouped by type
  getProjectsByType: async (): Promise<Array<{ name: string; value: number }>> => {
    const result = await query<GroupedResult>(
      `SELECT COALESCE(project_type, 'Unspecified') as name, COUNT(*) as count
       FROM projects
       GROUP BY project_type
       ORDER BY count DESC`
    );

    return result.rows.map((row) => ({
      name: row.name,
      value: parseInt(row.count, 10),
    }));
  },

  // Get projects grouped by status
  getProjectsByStatus: async (): Promise<Array<{ name: string; value: number }>> => {
    const result = await query<GroupedResult>(
      `SELECT status as name, COUNT(*) as count
       FROM projects
       GROUP BY status
       ORDER BY count DESC`
    );

    return result.rows.map((row) => ({
      name: row.name,
      value: parseInt(row.count, 10),
    }));
  },

  // Get forms grouped by status
  getFormsByStatus: async (): Promise<Array<{ name: string; value: number }>> => {
    const result = await query<GroupedResult>(
      `SELECT status as name, COUNT(*) as count
       FROM form_instances
       GROUP BY status
       ORDER BY count DESC`
    );

    return result.rows.map((row) => ({
      name: row.name,
      value: parseInt(row.count, 10),
    }));
  },

  // Get forms grouped by template
  getFormsByTemplate: async (): Promise<Array<{ name: string; value: number }>> => {
    const result = await query<GroupedResult>(
      `SELECT t.name as name, COUNT(f.id) as count
       FROM form_instances f
       JOIN templates t ON f.template_id = t.id
       GROUP BY t.id, t.name
       ORDER BY count DESC
       LIMIT 10`
    );

    return result.rows.map((row) => ({
      name: row.name,
      value: parseInt(row.count, 10),
    }));
  },

  // Get tasks grouped by status
  getTasksByStatus: async (): Promise<Array<{ name: string; value: number }>> => {
    const result = await query<GroupedResult>(
      `SELECT status as name, COUNT(*) as count
       FROM tasks
       GROUP BY status
       ORDER BY count DESC`
    );

    return result.rows.map((row) => ({
      name: row.name,
      value: parseInt(row.count, 10),
    }));
  },

  // Get tasks grouped by priority
  getTasksByPriority: async (): Promise<Array<{ name: string; value: number }>> => {
    const result = await query<GroupedResult>(
      `SELECT priority as name, COUNT(*) as count
       FROM tasks
       GROUP BY priority
       ORDER BY
         CASE priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 4
         END`
    );

    return result.rows.map((row) => ({
      name: row.name,
      value: parseInt(row.count, 10),
    }));
  },

  // Get activity trends over time
  getActivityTrends: async (
    startDate: Date,
    endDate: Date,
    interval: 'day' | 'week' | 'month' = 'day'
  ): Promise<Array<{ date: string; forms: number; reviews: number; logins: number }>> => {
    const dateFormat = interval === 'month' ? 'YYYY-MM' : interval === 'week' ? 'IYYY-IW' : 'YYYY-MM-DD';
    const truncFunc = interval === 'month' ? 'month' : interval === 'week' ? 'week' : 'day';

    // Get form submissions over time
    const formsResult = await query<TimeSeriesResult>(
      `SELECT TO_CHAR(DATE_TRUNC($1, created_at), $2) as period, COUNT(*) as count
       FROM form_instances
       WHERE created_at BETWEEN $3 AND $4
       GROUP BY period
       ORDER BY period`,
      [truncFunc, dateFormat, startDate, endDate]
    );

    // Get review actions over time
    const reviewsResult = await query<TimeSeriesResult>(
      `SELECT TO_CHAR(DATE_TRUNC($1, created_at), $2) as period, COUNT(*) as count
       FROM review_actions
       WHERE created_at BETWEEN $3 AND $4
       GROUP BY period
       ORDER BY period`,
      [truncFunc, dateFormat, startDate, endDate]
    );

    // Get logins over time
    const loginsResult = await query<TimeSeriesResult>(
      `SELECT TO_CHAR(DATE_TRUNC($1, created_at), $2) as period, COUNT(*) as count
       FROM audit_logs
       WHERE action = 'login' AND success = true AND created_at BETWEEN $3 AND $4
       GROUP BY period
       ORDER BY period`,
      [truncFunc, dateFormat, startDate, endDate]
    );

    // Create a map for each metric
    const formsMap = new Map(formsResult.rows.map((r) => [r.period, parseInt(r.count, 10)]));
    const reviewsMap = new Map(reviewsResult.rows.map((r) => [r.period, parseInt(r.count, 10)]));
    const loginsMap = new Map(loginsResult.rows.map((r) => [r.period, parseInt(r.count, 10)]));

    // Get all unique periods
    const allPeriods = new Set([...formsMap.keys(), ...reviewsMap.keys(), ...loginsMap.keys()]);
    const sortedPeriods = Array.from(allPeriods).sort();

    return sortedPeriods.map((period) => ({
      date: period,
      forms: formsMap.get(period) || 0,
      reviews: reviewsMap.get(period) || 0,
      logins: loginsMap.get(period) || 0,
    }));
  },

  // Get top researchers by forms created
  getTopResearchers: async (limit: number = 10): Promise<Array<{
    userId: string;
    fullName: string;
    email: string;
    formsCreated: number;
    formsApproved: number;
    projectsCount: number;
  }>> => {
    const result = await query<ResearcherResult>(
      `SELECT
         u.id as user_id,
         u.full_name,
         u.email,
         COUNT(DISTINCT f.id) as forms_created,
         COUNT(DISTINCT CASE WHEN f.status = 'approved' THEN f.id END) as forms_approved,
         COUNT(DISTINCT CASE WHEN p.principal_investigator_id = u.id THEN p.id END) as projects_count
       FROM users u
       LEFT JOIN form_instances f ON f.owner_id = u.id
       LEFT JOIN projects p ON p.principal_investigator_id = u.id
       WHERE u.role = 'researcher' AND u.is_active = true
       GROUP BY u.id, u.full_name, u.email
       ORDER BY forms_created DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => ({
      userId: row.user_id,
      fullName: row.full_name,
      email: row.email,
      formsCreated: parseInt(row.forms_created, 10),
      formsApproved: parseInt(row.forms_approved, 10),
      projectsCount: parseInt(row.projects_count, 10),
    }));
  },

  // Get department statistics
  getDepartmentStats: async (): Promise<Array<{
    department: string;
    projectsCount: number;
    formsCount: number;
  }>> => {
    const result = await query<DepartmentResult>(
      `SELECT
         COALESCE(p.department, 'Unspecified') as department,
         COUNT(DISTINCT p.id) as projects_count,
         COUNT(DISTINCT f.id) as forms_count
       FROM projects p
       LEFT JOIN form_instances f ON f.project_id = p.id
       GROUP BY p.department
       ORDER BY projects_count DESC`
    );

    return result.rows.map((row) => ({
      department: row.department,
      projectsCount: parseInt(row.projects_count, 10),
      formsCount: parseInt(row.forms_count, 10),
    }));
  },

  // Get review metrics
  getReviewMetrics: async (): Promise<{
    totalReviews: number;
    avgReviewTimeHours: number | null;
    approvalRate: number;
    rejectionRate: number;
    revisionRate: number;
  }> => {
    // Get total reviews and counts by outcome
    const metricsResult = await query<ReviewMetricsResult>(
      `SELECT
         COUNT(*) as total_reviews,
         ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))/3600)::numeric, 2) as avg_review_time_hours,
         COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
         COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
         COUNT(CASE WHEN status = 'revision_required' THEN 1 END) as revision_required_count
       FROM form_reviews
       WHERE status IN ('approved', 'rejected', 'revision_required')`
    );

    const row = metricsResult.rows[0];
    const totalReviews = parseInt(row?.total_reviews || '0', 10);
    const approvedCount = parseInt(row?.approved_count || '0', 10);
    const rejectedCount = parseInt(row?.rejected_count || '0', 10);
    const revisionCount = parseInt(row?.revision_required_count || '0', 10);

    const completedReviews = approvedCount + rejectedCount + revisionCount;

    return {
      totalReviews,
      avgReviewTimeHours: row?.avg_review_time_hours ? parseFloat(row.avg_review_time_hours) : null,
      approvalRate: completedReviews > 0 ? Math.round((approvedCount / completedReviews) * 100) : 0,
      rejectionRate: completedReviews > 0 ? Math.round((rejectedCount / completedReviews) * 100) : 0,
      revisionRate: completedReviews > 0 ? Math.round((revisionCount / completedReviews) * 100) : 0,
    };
  },

  // Get monthly submissions over the past N months
  getMonthlySubmissions: async (months: number = 12): Promise<Array<{
    month: string;
    submitted: number;
    approved: number;
    rejected: number;
  }>> => {
    const result = await query<{
      month: string;
      submitted: string;
      approved: string;
      rejected: string;
    }>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', f.created_at), 'YYYY-MM') as month,
         COUNT(*) as submitted,
         COUNT(CASE WHEN f.status = 'approved' THEN 1 END) as approved,
         COUNT(CASE WHEN f.status = 'rejected' THEN 1 END) as rejected
       FROM form_instances f
       WHERE f.created_at >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month' * $1
       GROUP BY month
       ORDER BY month`,
      [months]
    );

    return result.rows.map((row) => ({
      month: row.month,
      submitted: parseInt(row.submitted, 10),
      approved: parseInt(row.approved, 10),
      rejected: parseInt(row.rejected, 10),
    }));
  },

  // Get users by role
  getUsersByRole: async (): Promise<Array<{ name: string; value: number }>> => {
    const result = await query<GroupedResult>(
      `SELECT role as name, COUNT(*) as count
       FROM users
       WHERE is_active = true
       GROUP BY role
       ORDER BY count DESC`
    );

    return result.rows.map((row) => ({
      name: row.name,
      value: parseInt(row.count, 10),
    }));
  },
};

export default reportQueries;
