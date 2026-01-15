import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  FolderKanban,
  ClipboardCheck,
  Clock,
  Plus,
  ArrowRight,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useAuthStore } from '@/stores/authStore';
import { formsApi, projectsApi, tasksApi } from '@/lib/api';
import type { FormInstance, Project, Task } from '@/types';

export function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({
    totalForms: 0,
    drafts: 0,
    inReview: 0,
    approved: 0,
    projects: 0,
    pendingTasks: 0,
  });
  const [recentForms, setRecentForms] = useState<FormInstance[]>([]);
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [formsRes, projectsRes, tasksRes] = await Promise.all([
          formsApi.list(),
          projectsApi.list(),
          tasksApi.list(),
        ]);

        const forms = formsRes.data as FormInstance[];
        const projects = projectsRes.data as Project[];
        const tasks = tasksRes.data as Task[];

        setStats({
          totalForms: forms.length,
          drafts: forms.filter((f) => f.status === 'draft').length,
          inReview: forms.filter((f) => f.status === 'in_review').length,
          approved: forms.filter((f) => f.status === 'approved').length,
          projects: projects.length,
          pendingTasks: tasks.filter((t) => t.status === 'pending').length,
        });

        setRecentForms(forms.slice(0, 5));
        setRecentTasks(tasks.filter((t) => t.status !== 'completed').slice(0, 5));
      } catch (error) {
        console.error('Failed to load dashboard:', error);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
      draft: 'secondary',
      in_review: 'warning',
      needs_changes: 'destructive',
      approved: 'success',
      locked: 'default',
    };
    return <Badge variant={variants[status] || 'default'}>{status.replace('_', ' ')}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user?.fullName}
          </p>
        </div>
        <Button asChild>
          <Link to="/forms/new">
            <Plus className="mr-2 h-4 w-4" />
            New Form
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Forms</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalForms}</div>
            <p className="text-xs text-muted-foreground">
              {stats.drafts} drafts, {stats.approved} approved
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Review</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inReview}</div>
            <p className="text-xs text-muted-foreground">
              Awaiting reviewer approval
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projects</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.projects}</div>
            <p className="text-xs text-muted-foreground">Active projects</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Tasks</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pendingTasks}</div>
            <p className="text-xs text-muted-foreground">Tasks to complete</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Forms</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/forms">
                  View all
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <CardDescription>Your most recently updated forms</CardDescription>
          </CardHeader>
          <CardContent>
            {recentForms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">No forms yet</p>
                <Button asChild className="mt-4">
                  <Link to="/forms/new">Create your first form</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {recentForms.map((form) => (
                  <div
                    key={form.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex-1">
                      <Link
                        to={`/forms/${form.id}`}
                        className="font-medium hover:underline"
                      >
                        {form.title}
                      </Link>
                      <div className="mt-1 flex items-center gap-2">
                        {getStatusBadge(form.status)}
                        <span className="text-xs text-muted-foreground">
                          v{form.currentVersionNumber}
                        </span>
                      </div>
                    </div>
                    <div className="w-24">
                      <div className="mb-1 text-right text-xs text-muted-foreground">
                        {form.completionPercentage}%
                      </div>
                      <Progress value={form.completionPercentage} className="h-1" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Pending Tasks</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/tasks">
                  View all
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <CardDescription>Tasks requiring your attention</CardDescription>
          </CardHeader>
          <CardContent>
            {recentTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <ClipboardCheck className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">No pending tasks</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{task.title}</p>
                      {task.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                          {task.description}
                        </p>
                      )}
                      {task.dueDate && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Due: {new Date(task.dueDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant={
                        task.priority === 'urgent'
                          ? 'destructive'
                          : task.priority === 'high'
                          ? 'warning'
                          : 'secondary'
                      }
                    >
                      {task.priority}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
