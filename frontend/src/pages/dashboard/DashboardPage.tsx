import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  FolderKanban,
  ClipboardCheck,
  Clock,
  Plus,
  ArrowRight,
  CheckSquare,
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
  const [recentProjects, setRecentProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        // Load forms (this endpoint exists)
        const formsRes = await formsApi.list();
        const forms = (formsRes.data.data || []) as FormInstance[];

        // Try to load projects and tasks, but don't fail if they don't exist
        let projects: Project[] = [];
        let tasks: Task[] = [];

        try {
          const projectsRes = await projectsApi.list();
          projects = (projectsRes.data.data || []) as Project[];
        } catch {
          // Projects endpoint not implemented yet
        }

        try {
          const tasksRes = await tasksApi.list();
          tasks = (tasksRes.data.data || []) as Task[];
        } catch {
          // Tasks endpoint not implemented yet
        }

        setStats({
          totalForms: forms.length,
          drafts: forms.filter((f) => f.status === 'draft').length,
          inReview: forms.filter((f) => f.status === 'in_review').length,
          approved: forms.filter((f) => f.status === 'approved').length,
          projects: projects.length,
          pendingTasks: tasks.filter((t) => t.status === 'pending').length,
        });

        setRecentForms(forms.slice(0, 5));
        setRecentTasks(tasks.filter((t) => t.status === 'pending' || t.status === 'in_progress').slice(0, 5));
        setRecentProjects(projects.slice(0, 5));
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
          <Link to="/projects/new">
            <Plus className="mr-2 h-4 w-4" />
            New Project
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
        {/* Pending Tasks - First */}
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
                <CheckSquare className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">No pending tasks</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start justify-between rounded-lg border p-3"
                  >
                    <div className="flex-1">
                      <Link
                        to={`/tasks`}
                        className="font-medium hover:underline"
                      >
                        {task.title}
                      </Link>
                      {task.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                          {task.description}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="secondary">{task.task_type?.replace('_', ' ')}</Badge>
                        {task.dueDate && (
                          <span className="text-xs text-muted-foreground">
                            Due: {new Date(task.dueDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
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

        {/* Projects - Second */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Projects</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/projects">
                  View all
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <CardDescription>Your research projects</CardDescription>
          </CardHeader>
          <CardContent>
            {recentProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FolderKanban className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">No projects yet</p>
                <Button asChild className="mt-4">
                  <Link to="/projects/new">Create your first project</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {recentProjects.map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex-1">
                      <Link
                        to={`/projects/${project.id}`}
                        className="font-medium hover:underline"
                      >
                        {project.title}
                      </Link>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline">{project.project_type?.replace('_', ' ') || 'No type'}</Badge>
                        <Badge variant={project.status === 'active' ? 'success' : 'secondary'}>
                          {project.status}
                        </Badge>
                      </div>
                    </div>
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
