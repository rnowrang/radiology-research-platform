import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  CheckCircle,
  XCircle,
  RotateCcw,
  Loader2,
  FileText,
  FolderKanban,
  Calendar,
  User,
  Users,
  Mail,
  Clock,
  Download,
  ExternalLink,
  AlertCircle,
  File,
  ListTodo,
  Activity,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { useToast } from '@/hooks/useToast';
import { api } from '@/lib/api';
import { ActivityFeed } from '@/components/activity';
import { CollaboratorsManagement } from '@/components/admin/CollaboratorsManagement';

// =============================================================================
// Types
// =============================================================================

interface ProjectReviewSummary {
  project: {
    id: string;
    title: string;
    description?: string;
    project_type: string;
    project_type_label: string;
    status: string;
    department?: string;
    submitted_at?: string;
    created_at: string;
    updated_at: string;
  };
  principal_investigator: {
    id: string;
    name: string;
    email: string;
  };
  progress: {
    total_tasks: number;
    completed_tasks: number;
    completion_percentage: number;
  };
  forms: FormSummary[];
  tasks: TaskSummary[];
  files: FileSummary[];
}

interface FormSummary {
  id: number;
  title: string;
  template_name: string;
  status: string;
  completion_percentage: number;
  submitted_at?: string;
  created_at: string;
  updated_at: string;
}

interface TaskSummary {
  id: number;
  title: string;
  description?: string;
  task_type?: string;
  status: string;
  is_required: boolean;
  due_date?: string;
  completed_at?: string;
  assigned_to_name?: string;
}

interface FileSummary {
  id: string;
  original_file_name: string;
  file_size: number;
  mime_type: string;
  category: string;
  uploaded_by_name?: string;
  created_at: string;
}

// =============================================================================
// API Functions
// =============================================================================

const projectReviewApi = {
  getReviewSummary: (projectId: string) =>
    api.get(`/projects/${projectId}/review-summary`),
  approve: (projectId: string, notes?: string) =>
    api.post(`/projects/${projectId}/approve`, { notes }),
  reject: (projectId: string, notes: string) =>
    api.post(`/projects/${projectId}/reject`, { notes }),
  requestChanges: (projectId: string, notes: string) =>
    api.post(`/projects/${projectId}/request-changes`, { notes }),
};

// =============================================================================
// Helper Functions
// =============================================================================

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getStatusBadgeVariant = (status: string): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' => {
  switch (status) {
    case 'approved':
    case 'completed':
      return 'success';
    case 'pending':
    case 'pending_review':
    case 'submitted':
    case 'in_review':
      return 'warning';
    case 'rejected':
      return 'destructive';
    case 'draft':
      return 'secondary';
    default:
      return 'outline';
  }
};

const getStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    draft: 'Draft',
    pending: 'Pending',
    pending_review: 'Pending Review',
    submitted: 'Submitted',
    in_review: 'In Review',
    in_progress: 'In Progress',
    approved: 'Approved',
    completed: 'Completed',
    rejected: 'Rejected',
    needs_changes: 'Needs Changes',
    active: 'Active',
  };
  return labels[status] || status;
};

const getCategoryLabel = (category: string): string => {
  const labels: Record<string, string> = {
    proposal: 'Proposal',
    irb_document: 'IRB Document',
    consent_form: 'Consent Form',
    protocol: 'Protocol',
    data: 'Data',
    result: 'Result',
    other: 'Other',
  };
  return labels[category] || category;
};

const getTaskTypeLabel = (taskType?: string): string => {
  if (!taskType) return '-';
  const labels: Record<string, string> = {
    document_upload: 'Document Upload',
    form_completion: 'Form Completion',
    approval_required: 'Approval Required',
  };
  return labels[taskType] || taskType;
};

// =============================================================================
// Component
// =============================================================================

export function AdminProjectReviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [activeTab, setActiveTab] = useState('overview');
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | 'request_changes' | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  // Fetch project review summary
  const {
    data: summaryData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['projectReviewSummary', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID is required');
      const response = await projectReviewApi.getReviewSummary(projectId);
      return response.data.data as ProjectReviewSummary;
    },
    enabled: !!projectId,
  });

  // Mutations
  const approveMutation = useMutation({
    mutationFn: (notes?: string) => projectReviewApi.approve(projectId!, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectReviewSummary', projectId] });
      setReviewDialogOpen(false);
      setReviewNotes('');
      setReviewAction(null);
      toast({ title: 'Project approved successfully' });
    },
    onError: (err: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.response?.data?.error || 'Failed to approve project',
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (notes: string) => projectReviewApi.reject(projectId!, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectReviewSummary', projectId] });
      setReviewDialogOpen(false);
      setReviewNotes('');
      setReviewAction(null);
      toast({ title: 'Project rejected' });
    },
    onError: (err: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.response?.data?.error || 'Failed to reject project',
      });
    },
  });

  const requestChangesMutation = useMutation({
    mutationFn: (notes: string) => projectReviewApi.requestChanges(projectId!, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectReviewSummary', projectId] });
      setReviewDialogOpen(false);
      setReviewNotes('');
      setReviewAction(null);
      toast({ title: 'Changes requested' });
    },
    onError: (err: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.response?.data?.error || 'Failed to request changes',
      });
    },
  });

  const handleOpenReviewDialog = (action: 'approve' | 'reject' | 'request_changes') => {
    setReviewAction(action);
    setReviewNotes('');
    setReviewDialogOpen(true);
  };

  const handleSubmitReview = () => {
    if (!reviewAction) return;

    if (reviewAction === 'approve') {
      approveMutation.mutate(reviewNotes || undefined);
    } else if (reviewAction === 'reject') {
      if (!reviewNotes.trim()) {
        toast({
          variant: 'destructive',
          title: 'Notes required',
          description: 'Please provide a reason for rejection',
        });
        return;
      }
      rejectMutation.mutate(reviewNotes);
    } else if (reviewAction === 'request_changes') {
      if (!reviewNotes.trim()) {
        toast({
          variant: 'destructive',
          title: 'Notes required',
          description: 'Please describe the changes needed',
        });
        return;
      }
      requestChangesMutation.mutate(reviewNotes);
    }
  };

  const isSubmitting = approveMutation.isPending || rejectMutation.isPending || requestChangesMutation.isPending;

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Project Review</h1>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error instanceof Error ? error.message : 'Failed to load project review data'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!summaryData) {
    return null;
  }

  const { project, principal_investigator, progress, forms, tasks, files } = summaryData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold">{project.title}</h1>
              <Badge variant={getStatusBadgeVariant(project.status)}>
                {getStatusLabel(project.status)}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {principal_investigator.name}
              </span>
              <span className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" />
                {principal_investigator.email}
              </span>
              <span className="flex items-center gap-1">
                <FolderKanban className="h-3.5 w-3.5" />
                {project.project_type_label}
              </span>
              {project.submitted_at && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Submitted {formatDate(project.submitted_at)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenReviewDialog('request_changes')}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Request Changes
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleOpenReviewDialog('reject')}
          >
            <XCircle className="mr-2 h-4 w-4" />
            Reject
          </Button>
          <Button onClick={() => handleOpenReviewDialog('approve')}>
            <CheckCircle className="mr-2 h-4 w-4" />
            Approve
          </Button>
        </div>
      </div>

      {/* Progress Section */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 max-w-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Progress</span>
                <span className="text-sm text-muted-foreground">
                  {progress.completion_percentage}%
                </span>
              </div>
              <Progress value={progress.completion_percentage} className="h-2" />
            </div>
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-muted-foreground" />
                <span>
                  <strong>{progress.completed_tasks}</strong>/{progress.total_tasks} Tasks
                </span>
              </div>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span>
                  <strong>{forms.length}</strong> Forms
                </span>
              </div>
              <div className="flex items-center gap-2">
                <File className="h-4 w-4 text-muted-foreground" />
                <span>
                  <strong>{files.length}</strong> Files
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabbed Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <Info className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="forms" className="gap-2">
            <FileText className="h-4 w-4" />
            Forms
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-2">
            <ListTodo className="h-4 w-4" />
            Tasks
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-2">
            <File className="h-4 w-4" />
            Files
          </TabsTrigger>
          <TabsTrigger value="collaborators" className="gap-2">
            <Users className="h-4 w-4" />
            Collaborators
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="h-4 w-4" />
            Activity
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Project Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground">Description</label>
                  <p className="mt-1">
                    {project.description || 'No description provided'}
                  </p>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Project Type</span>
                    <p className="font-medium">{project.project_type_label}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Department</span>
                    <p className="font-medium">{project.department || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created</span>
                    <p className="font-medium">{formatDate(project.created_at)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Last Updated</span>
                    <p className="font-medium">{formatDate(project.updated_at)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Review Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm font-medium">Tasks Completion</span>
                  <span className={`font-bold ${progress.completion_percentage === 100 ? 'text-green-600' : 'text-amber-600'}`}>
                    {progress.completed_tasks}/{progress.total_tasks}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm font-medium">Forms Submitted</span>
                  <span className="font-bold">
                    {forms.filter(f => f.status !== 'draft').length}/{forms.length}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm font-medium">Documents Uploaded</span>
                  <span className="font-bold">{files.length}</span>
                </div>
                {progress.completion_percentage < 100 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Some tasks are still incomplete. Consider requesting changes before approval.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Forms Tab */}
        <TabsContent value="forms" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Forms</CardTitle>
              <CardDescription>
                All forms associated with this project
              </CardDescription>
            </CardHeader>
            <CardContent>
              {forms.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No Forms</h3>
                  <p className="text-muted-foreground mt-1">
                    No forms have been created for this project yet
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {forms.map((form) => (
                    <div
                      key={form.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{form.title}</span>
                          <Badge variant={getStatusBadgeVariant(form.status)}>
                            {getStatusLabel(form.status)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{form.template_name}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(form.updated_at)}
                          </span>
                          <span>{form.completion_percentage}% complete</span>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/forms/${form.id}/view`}>
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Tasks</CardTitle>
              <CardDescription>
                All tasks associated with this project
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ListTodo className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No Tasks</h3>
                  <p className="text-muted-foreground mt-1">
                    No tasks have been assigned to this project yet
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{task.title}</span>
                          <Badge variant={getStatusBadgeVariant(task.status)}>
                            {getStatusLabel(task.status)}
                          </Badge>
                          {task.is_required && (
                            <Badge variant="secondary">Required</Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                          <span>{getTaskTypeLabel(task.task_type)}</span>
                          {task.assigned_to_name && (
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {task.assigned_to_name}
                            </span>
                          )}
                          {task.due_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Due {formatDate(task.due_date)}
                            </span>
                          )}
                          {task.completed_at && (
                            <span className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-3 w-3" />
                              Completed {formatDate(task.completed_at)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Files Tab */}
        <TabsContent value="files" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Files</CardTitle>
              <CardDescription>
                All files uploaded for this project
              </CardDescription>
            </CardHeader>
            <CardContent>
              {files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <File className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No Files</h3>
                  <p className="text-muted-foreground mt-1">
                    No files have been uploaded to this project yet
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <File className="h-8 w-8 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {file.original_file_name}
                          </p>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <Badge variant="outline">
                              {getCategoryLabel(file.category)}
                            </Badge>
                            <span>{formatFileSize(file.file_size)}</span>
                            {file.uploaded_by_name && (
                              <span>by {file.uploaded_by_name}</span>
                            )}
                            <span>{formatDate(file.created_at)}</span>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(`/api/files/${file.id}`, '_blank')}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Collaborators Tab */}
        <TabsContent value="collaborators" className="mt-4">
          <CollaboratorsManagement projectId={projectId!} />
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>
                Recent activity for this project
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityFeed
                type="project"
                resourceId={projectId}
                title=""
                maxHeight="500px"
                pageSize={20}
                showFilters
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Review Dialog */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'approve' && 'Approve Project'}
              {reviewAction === 'reject' && 'Reject Project'}
              {reviewAction === 'request_changes' && 'Request Changes'}
            </DialogTitle>
            <DialogDescription>
              {reviewAction === 'approve' && 'Confirm that you want to approve this project.'}
              {reviewAction === 'reject' && 'Please provide a reason for rejecting this project.'}
              {reviewAction === 'request_changes' && 'Please describe the changes that need to be made.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reviewNotes">
                {reviewAction === 'approve' ? 'Notes (optional)' : 'Notes'}{' '}
                {reviewAction !== 'approve' && <span className="text-destructive">*</span>}
              </Label>
              <Textarea
                id="reviewNotes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={
                  reviewAction === 'approve'
                    ? 'Add any optional notes...'
                    : reviewAction === 'reject'
                    ? 'Explain why this project is being rejected...'
                    : 'Describe the changes needed...'
                }
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReviewDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant={reviewAction === 'reject' ? 'destructive' : 'default'}
              onClick={handleSubmitReview}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {reviewAction === 'approve' && 'Approve'}
              {reviewAction === 'reject' && 'Reject'}
              {reviewAction === 'request_changes' && 'Request Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
