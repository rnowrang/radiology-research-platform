import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Users,
  FileText,
  FolderKanban,
  Shield,
  Activity,
  ChevronRight,
  GitBranch,
  BarChart3,
  Mail,
  Settings2,
  ClipboardCheck,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formsApi, projectsApi, api } from '@/lib/api';
import { ActivityFeed } from '@/components/activity';

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalForms: number;
  formsInReview: number;
  totalProjects: number;
  activeProjects: number;
  pendingTaskReviews: number;
}

export function AdminDashboardPage() {
  const { data: formsData } = useQuery({
    queryKey: ['adminForms'],
    queryFn: async () => {
      const response = await formsApi.list();
      return response.data.data || [];
    },
  });

  const { data: projectsData } = useQuery({
    queryKey: ['adminProjects'],
    queryFn: async () => {
      const response = await projectsApi.list();
      return response.data.data || [];
    },
  });

  const { data: pendingTasksData } = useQuery({
    queryKey: ['adminPendingTasks'],
    queryFn: async () => {
      try {
        const response = await api.get('/tasks/pending-review', { params: { limit: 1 } });
        return response.data.pagination?.total || 0;
      } catch {
        return 0;
      }
    },
  });

  const forms = formsData || [];
  const projects = projectsData || [];
  const pendingTaskReviews = pendingTasksData || 0;

  const stats: DashboardStats = {
    totalUsers: 0, // Would need users endpoint
    activeUsers: 0,
    totalForms: forms.length,
    formsInReview: forms.filter((f: any) => f.status === 'in_review').length,
    totalProjects: projects.length,
    activeProjects: projects.filter((p: any) => p.status === 'active').length,
    pendingTaskReviews,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          System overview and management
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Forms</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalForms}</div>
            <p className="text-xs text-muted-foreground">
              {stats.formsInReview} in review
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projects</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProjects}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activeProjects} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">
              User management available
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">Online</div>
            <p className="text-xs text-muted-foreground">
              All systems operational
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common administrative tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              to="/admin/users"
              className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Manage Users</p>
                  <p className="text-sm text-muted-foreground">
                    View and manage user accounts
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
            <Link
              to="/admin/audit"
              className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <Shield className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Audit Logs</p>
                  <p className="text-sm text-muted-foreground">
                    View system audit trail
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
            <Link
              to="/review"
              className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Review Queue</p>
                  <p className="text-sm text-muted-foreground">
                    {stats.formsInReview} forms awaiting review
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
            <Link
              to="/admin/review-stages"
              className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <GitBranch className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Review Stages</p>
                  <p className="text-sm text-muted-foreground">
                    Configure review workflow stages
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
            <Link
              to="/admin/reports"
              className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Reports & Analytics</p>
                  <p className="text-sm text-muted-foreground">
                    View platform insights and metrics
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
            <Link
              to="/admin/email"
              className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Email Settings</p>
                  <p className="text-sm text-muted-foreground">
                    Configure and test email notifications
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
            <Link
              to="/admin/workflow-config"
              className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <Settings2 className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Workflow Configuration</p>
                  <p className="text-sm text-muted-foreground">
                    Manage task definitions and project mappings
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
            <Link
              to="/admin/task-review"
              className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
            >
              <div className="flex items-center gap-3">
                <ClipboardCheck className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Task Review</p>
                  <p className="text-sm text-muted-foreground">
                    {stats.pendingTaskReviews > 0
                      ? `${stats.pendingTaskReviews} task${stats.pendingTaskReviews !== 1 ? 's' : ''} pending review`
                      : 'Review submitted tasks'}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest system events</CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityFeed
              type="global"
              title=""
              compact
              maxHeight="280px"
              pageSize={10}
              showFilters={false}
            />
            <Button asChild variant="outline" className="w-full mt-3">
              <Link to="/admin/audit">View All Activity</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
