import { reportQueries } from '../database/queries/reportQueries.js';

export type ChartType = 'bar' | 'pie' | 'line' | 'area';

export interface ChartDataPoint {
  name: string;
  value: number;
  [key: string]: string | number;
}

export interface FormattedChartData {
  type: ChartType;
  data: ChartDataPoint[];
  labels?: string[];
  total?: number;
}

export interface OverviewReport {
  metrics: {
    totalUsers: number;
    activeUsers: number;
    totalProjects: number;
    activeProjects: number;
    totalForms: number;
    formsInReview: number;
    totalTasks: number;
    pendingTasks: number;
  };
  generatedAt: string;
}

export interface ProjectsReport {
  byType: ChartDataPoint[];
  byStatus: ChartDataPoint[];
  byDepartment: Array<{
    department: string;
    projectsCount: number;
    formsCount: number;
  }>;
  generatedAt: string;
}

export interface FormsReport {
  byStatus: ChartDataPoint[];
  byTemplate: ChartDataPoint[];
  monthlySubmissions: Array<{
    month: string;
    submitted: number;
    approved: number;
    rejected: number;
  }>;
  reviewMetrics: {
    totalReviews: number;
    avgReviewTimeHours: number | null;
    approvalRate: number;
    rejectionRate: number;
    revisionRate: number;
  };
  generatedAt: string;
}

export interface ActivityReport {
  trends: Array<{
    date: string;
    forms: number;
    reviews: number;
    logins: number;
  }>;
  topResearchers: Array<{
    userId: string;
    fullName: string;
    email: string;
    formsCreated: number;
    formsApproved: number;
    projectsCount: number;
  }>;
  startDate: string;
  endDate: string;
  generatedAt: string;
}

// Status display name mapping
const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  completed: 'Completed',
  archived: 'Archived',
  in_review: 'In Review',
  needs_changes: 'Needs Changes',
  approved: 'Approved',
  rejected: 'Rejected',
  locked: 'Locked',
  pending: 'Pending',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
};

// Priority display name mapping
const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

// Role display name mapping
const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  reviewer: 'Reviewer',
  researcher: 'Researcher',
};

export const reportService = {
  // Format raw data for chart libraries
  formatChartData: (raw: Array<{ name: string; value: number }>, type: ChartType): FormattedChartData => {
    const total = raw.reduce((sum, item) => sum + item.value, 0);
    const labels = raw.map((item) => item.name);

    return {
      type,
      data: raw,
      labels,
      total,
    };
  },

  // Apply friendly labels to status values
  formatStatusLabels: (data: Array<{ name: string; value: number }>): Array<{ name: string; value: number }> => {
    return data.map((item) => ({
      ...item,
      name: STATUS_LABELS[item.name] || item.name,
    }));
  },

  // Apply friendly labels to priority values
  formatPriorityLabels: (data: Array<{ name: string; value: number }>): Array<{ name: string; value: number }> => {
    return data.map((item) => ({
      ...item,
      name: PRIORITY_LABELS[item.name] || item.name,
    }));
  },

  // Apply friendly labels to role values
  formatRoleLabels: (data: Array<{ name: string; value: number }>): Array<{ name: string; value: number }> => {
    return data.map((item) => ({
      ...item,
      name: ROLE_LABELS[item.name] || item.name,
    }));
  },

  // Generate a comprehensive overview report
  generateOverviewReport: async (): Promise<OverviewReport> => {
    const metrics = await reportQueries.getOverviewMetrics();

    return {
      metrics,
      generatedAt: new Date().toISOString(),
    };
  },

  // Generate a projects-focused report
  generateProjectsReport: async (): Promise<ProjectsReport> => {
    const [byType, byStatus, byDepartment] = await Promise.all([
      reportQueries.getProjectsByType(),
      reportQueries.getProjectsByStatus(),
      reportQueries.getDepartmentStats(),
    ]);

    return {
      byType,
      byStatus: reportService.formatStatusLabels(byStatus),
      byDepartment,
      generatedAt: new Date().toISOString(),
    };
  },

  // Generate a forms-focused report
  generateFormsReport: async (): Promise<FormsReport> => {
    const [byStatus, byTemplate, monthlySubmissions, reviewMetrics] = await Promise.all([
      reportQueries.getFormsByStatus(),
      reportQueries.getFormsByTemplate(),
      reportQueries.getMonthlySubmissions(12),
      reportQueries.getReviewMetrics(),
    ]);

    return {
      byStatus: reportService.formatStatusLabels(byStatus),
      byTemplate,
      monthlySubmissions,
      reviewMetrics,
      generatedAt: new Date().toISOString(),
    };
  },

  // Generate an activity-focused report
  generateActivityReport: async (startDate: Date, endDate: Date): Promise<ActivityReport> => {
    const [trends, topResearchers] = await Promise.all([
      reportQueries.getActivityTrends(startDate, endDate, 'day'),
      reportQueries.getTopResearchers(10),
    ]);

    return {
      trends,
      topResearchers,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
    };
  },

  // Get tasks report data
  getTasksReport: async (): Promise<{
    byStatus: Array<{ name: string; value: number }>;
    byPriority: Array<{ name: string; value: number }>;
  }> => {
    const [byStatus, byPriority] = await Promise.all([
      reportQueries.getTasksByStatus(),
      reportQueries.getTasksByPriority(),
    ]);

    return {
      byStatus: reportService.formatStatusLabels(byStatus),
      byPriority: reportService.formatPriorityLabels(byPriority),
    };
  },

  // Get users report data
  getUsersReport: async (): Promise<{
    byRole: Array<{ name: string; value: number }>;
  }> => {
    const byRole = await reportQueries.getUsersByRole();

    return {
      byRole: reportService.formatRoleLabels(byRole),
    };
  },
};

export default reportService;
