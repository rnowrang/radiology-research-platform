import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  Edit,
  Trash2,
  Plus,
  FileText,
  Users,
  Calendar,
  MoreVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/stores/authStore';
import { projectsApi, formsApi } from '@/lib/api';
import { ActivityFeed } from '@/components/activity';

interface ProjectResponse {
  id: string;
  title: string;
  description?: string;
  project_type?: string;
  department?: string;
  principal_investigator_id: string;
  status: string;
  start_date?: string;
  end_date?: string;
  is_public: boolean;
  created_at: string;
  updated_at?: string;
  collaborators: Array<{
    id: string;
    user_id: string;
    role: string;
    added_at: string;
  }>;
  form_count: number;
}

interface FormItem {
  id: number;
  title: string;
  status: string;
  template_name?: string;
  completion_percentage: number;
  created_at: string;
  updated_at?: string;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  active: { label: 'Active', variant: 'default' },
  completed: { label: 'Completed', variant: 'outline' },
  archived: { label: 'Archived', variant: 'outline' },
};

const formStatusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  in_review: { label: 'In Review', variant: 'default' },
  needs_changes: { label: 'Needs Changes', variant: 'destructive' },
  approved: { label: 'Approved', variant: 'outline' },
  locked: { label: 'Locked', variant: 'outline' },
};

const projectTypes: Record<string, string> = {
  retrospective: 'Retrospective Study',
  prospective: 'Prospective Study',
  clinical_trial: 'Clinical Trial',
  quality_improvement: 'Quality Improvement',
  educational: 'Educational Research',
  other: 'Other',
};

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState('forms');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: async () => {
      const response = await projectsApi.get(id!);
      return response.data.data as ProjectResponse;
    },
    enabled: !!id,
  });

  const { data: forms, isLoading: formsLoading } = useQuery({
    queryKey: ['projectForms', id],
    queryFn: async () => {
      const response = await formsApi.list({ projectId: id });
      return response.data.data as FormItem[];
    },
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => projectsApi.delete(id!),
    onSuccess: () => {
      toast({
        title: 'Project deleted',
        description: 'The project has been deleted',
      });
      navigate('/projects');
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.detail || 'Failed to delete project',
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: string) => projectsApi.update(id!, { status }),
    onSuccess: () => {
      toast({ title: 'Project status updated' });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
    },
    onError: () => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update status',
      });
    },
  });

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Not set';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const isOwner = user?.id === project?.principal_investigator_id;

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <h2 className="text-xl font-semibold">Project not found</h2>
        <Button asChild className="mt-4">
          <Link to="/projects">Back to Projects</Link>
        </Button>
      </div>
    );
  }

  const config = statusConfig[project.status] || statusConfig.draft;
  const projectForms = forms || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/projects')}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{project.title}</h1>
              <Badge variant={config.variant}>{config.label}</Badge>
            </div>
            <p className="text-muted-foreground mt-1">
              {project.project_type && projectTypes[project.project_type]}
              {project.department && ` | ${project.department}`}
            </p>
          </div>
        </div>

        {isOwner && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/projects/${id}/edit`)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit Project
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {project.status === 'draft' && (
                <DropdownMenuItem onClick={() => updateStatusMutation.mutate('active')}>
                  Mark as Active
                </DropdownMenuItem>
              )}
              {project.status === 'active' && (
                <DropdownMenuItem onClick={() => updateStatusMutation.mutate('completed')}>
                  Mark as Completed
                </DropdownMenuItem>
              )}
              {project.status !== 'archived' && (
                <DropdownMenuItem onClick={() => updateStatusMutation.mutate('archived')}>
                  Archive Project
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Project Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Forms</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projectForms.length}</div>
            <p className="text-xs text-muted-foreground">
              {projectForms.filter((f) => f.status === 'approved').length} approved
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Collaborators</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{project.collaborators.length}</div>
            <p className="text-xs text-muted-foreground">Team members</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Start Date</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{formatDate(project.start_date)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">End Date</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-semibold">{formatDate(project.end_date)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Description */}
      {project.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">
              {project.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="forms">Forms ({projectForms.length})</TabsTrigger>
          <TabsTrigger value="collaborators">
            Collaborators ({project.collaborators.length})
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="forms" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Project Forms</CardTitle>
                <CardDescription>Forms associated with this project</CardDescription>
              </div>
              <Button asChild>
                <Link to={`/forms/new?projectId=${id}`}>
                  <Plus className="mr-2 h-4 w-4" />
                  New Form
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {formsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : projectForms.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No forms yet</h3>
                  <p className="text-muted-foreground mt-1">
                    Create a form for this project to get started
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {projectForms.map((form) => {
                    const formConfig = formStatusConfig[form.status] || formStatusConfig.draft;
                    return (
                      <div
                        key={form.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => navigate(`/forms/${form.id}`)}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{form.title}</span>
                            <Badge variant={formConfig.variant}>{formConfig.label}</Badge>
                          </div>
                          {form.template_name && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {form.template_name}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="w-24">
                            <div className="text-right text-xs text-muted-foreground mb-1">
                              {form.completion_percentage}%
                            </div>
                            <Progress value={form.completion_percentage} className="h-1" />
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {formatDate(form.created_at)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="collaborators" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Collaborators</CardTitle>
                <CardDescription>Team members working on this project</CardDescription>
              </div>
              {isOwner && (
                <Button variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Collaborator
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {project.collaborators.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No collaborators yet</h3>
                  <p className="text-muted-foreground mt-1">
                    Add team members to collaborate on this project
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {project.collaborators.map((collab) => (
                    <div
                      key={collab.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{collab.user_id.slice(0, 8)}...</p>
                        <p className="text-sm text-muted-foreground capitalize">
                          {collab.role.replace('_', ' ')}
                        </p>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        Added {formatDate(collab.added_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Project Activity</CardTitle>
              <CardDescription>Recent activity on this project</CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityFeed
                type="project"
                resourceId={id}
                title=""
                showFilters
                maxHeight="500px"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Project Settings</CardTitle>
              <CardDescription>Manage project configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Project Status</p>
                  <p className="text-sm text-muted-foreground">
                    Current status: {config.label}
                  </p>
                </div>
                {isOwner && (
                  <Badge variant={config.variant}>{config.label}</Badge>
                )}
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Visibility</p>
                  <p className="text-sm text-muted-foreground">
                    {project.is_public ? 'Public project' : 'Private project'}
                  </p>
                </div>
                <Badge variant={project.is_public ? 'default' : 'secondary'}>
                  {project.is_public ? 'Public' : 'Private'}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <p className="font-medium">Created</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(project.created_at)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this project? This action cannot be undone.
              {projectForms.length > 0 && (
                <span className="block mt-2 text-destructive">
                  Note: You must remove all forms before deleting this project.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate()}
              disabled={projectForms.length > 0}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
