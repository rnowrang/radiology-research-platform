import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  Calendar,
  User,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Send,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  FileText,
  FolderKanban,
  Upload,
  Loader2,
  Play,
  Edit,
  MessageSquare,
  History,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb, type BreadcrumbItem } from '@/components/ui/breadcrumb';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/stores/authStore';
import { tasksApi, filesApi } from '@/lib/api';
import { UploadDropzone } from '@/components/tasks/UploadDropzone';
import { FileCard, type FileCardFile } from '@/components/files/FileCard';
import { FilePreviewModal, type FilePreviewModalFile } from '@/components/files/FilePreviewModal';

// Task status types
type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'revision_required'
  | 'completed'
  | 'blocked'
  | 'cancelled';

// Task type types
type TaskType = 'document_upload' | 'form_completion' | 'approval_required' | 'review' | 'general';

// Task detail interface
interface TaskDetail {
  id: number;
  title: string;
  description?: string;
  task_type?: TaskType | string;
  status: TaskStatus;
  priority: string;
  is_required: boolean;
  due_date?: string;
  project_id?: string;
  project_title?: string;
  form_instance_id?: number;
  form_title?: string;
  assigned_to_id?: string;
  assigned_to_name?: string;
  created_by_id: string;
  created_by_name?: string;
  task_definition_id?: number;
  completed_at?: string;
  submitted_at?: string;
  reviewed_at?: string;
  reviewed_by_id?: string;
  reviewed_by_name?: string;
  reviewer_comments?: string;
  revision_count: number;
  created_at: string;
  updated_at?: string;
}

// Status history item interface
interface StatusHistoryItem {
  status: string;
  timestamp: string;
  performed_by_name?: string;
  comments?: string;
}

// Status configuration
const statusConfig: Record<
  TaskStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any; color: string }
> = {
  pending: { label: 'Pending', variant: 'secondary', icon: Clock, color: 'text-gray-500' },
  in_progress: { label: 'In Progress', variant: 'default', icon: Clock, color: 'text-blue-500' },
  submitted: { label: 'Submitted', variant: 'default', icon: Send, color: 'text-yellow-500' },
  approved: { label: 'Approved', variant: 'outline', icon: CheckCircle, color: 'text-green-500' },
  rejected: { label: 'Rejected', variant: 'destructive', icon: XCircle, color: 'text-red-500' },
  revision_required: { label: 'Revision Required', variant: 'destructive', icon: RotateCcw, color: 'text-amber-500' },
  completed: { label: 'Completed', variant: 'outline', icon: CheckCircle, color: 'text-green-500' },
  blocked: { label: 'Blocked', variant: 'destructive', icon: AlertCircle, color: 'text-red-500' },
  cancelled: { label: 'Cancelled', variant: 'outline', icon: XCircle, color: 'text-gray-500' },
};

// Priority configuration
const priorityConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  low: { label: 'Low', variant: 'outline' },
  medium: { label: 'Medium', variant: 'secondary' },
  high: { label: 'High', variant: 'default' },
  urgent: { label: 'Urgent', variant: 'destructive' },
};

// Task type configuration
const taskTypeConfig: Record<string, { label: string; icon: any; color: string }> = {
  document_upload: { label: 'Document Upload', icon: Upload, color: 'text-blue-500' },
  form_completion: { label: 'Form Completion', icon: FileText, color: 'text-green-500' },
  approval_required: { label: 'Approval Required', icon: CheckCircle, color: 'text-purple-500' },
  review: { label: 'Review', icon: MessageSquare, color: 'text-indigo-500' },
  general: { label: 'General', icon: FileText, color: 'text-gray-500' },
};

// Helper functions
function formatDate(dateStr?: string): string {
  if (!dateStr) return 'Not set';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateStr?: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isOverdue(task: TaskDetail): boolean {
  if (['completed', 'approved', 'cancelled'].includes(task.status)) return false;
  if (!task.due_date) return false;
  return new Date(task.due_date) < new Date();
}

export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  // Dialog states
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showRevisionDialog, setShowRevisionDialog] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');

  // File preview states
  const [previewFile, setPreviewFile] = useState<FilePreviewModalFile | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Fetch task details
  const { data: task, isLoading: taskLoading, error: taskError } = useQuery({
    queryKey: ['task', taskId],
    queryFn: async () => {
      const response = await tasksApi.get(parseInt(taskId!));
      return response.data.data as TaskDetail;
    },
    enabled: !!taskId,
  });

  // Fetch task-specific files if this is a document_upload task
  const { data: taskFiles, isLoading: taskFilesLoading, error: taskFilesError } = useQuery({
    queryKey: ['taskFiles', taskId],
    queryFn: async () => {
      const response = await filesApi.getTaskFiles(parseInt(taskId!));
      return response.data.data as FileCardFile[];
    },
    enabled: !!taskId && task?.task_type === 'document_upload',
  });

  // Mutations
  const startTaskMutation = useMutation({
    mutationFn: () => tasksApi.update(parseInt(taskId!), { status: 'in_progress' }),
    onSuccess: () => {
      toast({ title: 'Task started' });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      // Also invalidate project-level queries so ProjectDetailPage updates
      if (task?.project_id) {
        queryClient.invalidateQueries({ queryKey: ['projectTasks', task.project_id] });
        queryClient.invalidateQueries({ queryKey: ['projectTaskProgress', task.project_id] });
      }
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to start task',
      });
    },
  });

  const submitTaskMutation = useMutation({
    mutationFn: () => tasksApi.submit(parseInt(taskId!)),
    onSuccess: () => {
      toast({ title: 'Task submitted for review' });
      setShowSubmitDialog(false);
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      // Also invalidate project-level queries so ProjectDetailPage updates
      if (task?.project_id) {
        queryClient.invalidateQueries({ queryKey: ['projectTasks', task.project_id] });
        queryClient.invalidateQueries({ queryKey: ['projectTaskProgress', task.project_id] });
      }
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to submit task',
      });
    },
  });

  const approveTaskMutation = useMutation({
    mutationFn: (notes?: string) => tasksApi.approve(parseInt(taskId!), notes),
    onSuccess: () => {
      toast({ title: 'Task approved' });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['pendingReviewTasks'] });
      // Also invalidate project-level queries so ProjectDetailPage updates
      if (task?.project_id) {
        queryClient.invalidateQueries({ queryKey: ['projectTasks', task.project_id] });
        queryClient.invalidateQueries({ queryKey: ['projectTaskProgress', task.project_id] });
      }
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to approve task',
      });
    },
  });

  const rejectTaskMutation = useMutation({
    mutationFn: (notes: string) => tasksApi.reject(parseInt(taskId!), notes),
    onSuccess: () => {
      toast({ title: 'Task rejected' });
      setShowRejectDialog(false);
      setReviewNotes('');
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['pendingReviewTasks'] });
      // Also invalidate project-level queries so ProjectDetailPage updates
      if (task?.project_id) {
        queryClient.invalidateQueries({ queryKey: ['projectTasks', task.project_id] });
        queryClient.invalidateQueries({ queryKey: ['projectTaskProgress', task.project_id] });
      }
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to reject task',
      });
    },
  });

  const requestRevisionMutation = useMutation({
    mutationFn: (notes: string) => tasksApi.requestRevision(parseInt(taskId!), notes),
    onSuccess: () => {
      toast({ title: 'Revision requested' });
      setShowRevisionDialog(false);
      setReviewNotes('');
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      queryClient.invalidateQueries({ queryKey: ['pendingReviewTasks'] });
      // Also invalidate project-level queries so ProjectDetailPage updates
      if (task?.project_id) {
        queryClient.invalidateQueries({ queryKey: ['projectTasks', task.project_id] });
        queryClient.invalidateQueries({ queryKey: ['projectTaskProgress', task.project_id] });
      }
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to request revision',
      });
    },
  });

  const reviseTaskMutation = useMutation({
    mutationFn: () => tasksApi.update(parseInt(taskId!), { status: 'in_progress' }),
    onSuccess: () => {
      toast({ title: 'Task reopened for revision' });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
      // Also invalidate project-level queries so ProjectDetailPage updates
      if (task?.project_id) {
        queryClient.invalidateQueries({ queryKey: ['projectTasks', task.project_id] });
        queryClient.invalidateQueries({ queryKey: ['projectTaskProgress', task.project_id] });
      }
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to revise task',
      });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileId: string) => filesApi.delete(fileId),
    onSuccess: () => {
      toast({ title: 'File deleted' });
      queryClient.invalidateQueries({ queryKey: ['taskFiles', taskId] });
      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to delete file',
      });
    },
  });

  // Loading state
  if (taskLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (taskError || !task) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-xl font-semibold">Task not found</h2>
        <p className="text-muted-foreground mt-2">
          The task you're looking for doesn't exist or you don't have access to it.
        </p>
        <Button asChild className="mt-4">
          <Link to="/tasks">Back to Tasks</Link>
        </Button>
      </div>
    );
  }

  // Role-based permissions
  const isAdmin = user?.role === 'admin';
  const isReviewer = user?.role === 'reviewer';
  const isOwner = user?.id === task.assigned_to_id || user?.id === task.created_by_id;
  const canReview = (isAdmin || isReviewer) && task.status === 'submitted';
  const canStart = isOwner && task.status === 'pending';
  const canSubmit = isOwner && task.status === 'in_progress';
  const canRevise = isOwner && (task.status === 'rejected' || task.status === 'revision_required');

  // Task type specific logic
  const isFormCompletionTask = task.task_type === 'form_completion';
  const isDocumentUploadTask = task.task_type === 'document_upload';
  const hasForm = !!task.form_instance_id;

  // Status config
  const config = statusConfig[task.status as TaskStatus] || statusConfig.pending;
  const StatusIcon = config.icon;
  const priorityConf = priorityConfig[task.priority] || priorityConfig.medium;
  const typeConfig = task.task_type ? taskTypeConfig[task.task_type] : null;
  const TypeIcon = typeConfig?.icon;
  const overdue = isOverdue(task);

  // Build status history from task data
  const statusHistory: StatusHistoryItem[] = [];
  if (task.created_at) {
    statusHistory.push({
      status: 'created',
      timestamp: task.created_at,
      performed_by_name: task.created_by_name || 'Unknown',
    });
  }
  if (task.submitted_at) {
    statusHistory.push({
      status: 'submitted',
      timestamp: task.submitted_at,
      performed_by_name: task.assigned_to_name || task.created_by_name || 'Unknown',
    });
  }
  if (task.reviewed_at && task.status !== 'submitted') {
    statusHistory.push({
      status: task.status,
      timestamp: task.reviewed_at,
      performed_by_name: task.reviewed_by_name || 'Reviewer',
      comments: task.reviewer_comments,
    });
  }
  if (task.completed_at) {
    statusHistory.push({
      status: 'completed',
      timestamp: task.completed_at,
    });
  }

  // Sort by timestamp descending
  statusHistory.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Build breadcrumb items based on whether task has a project
  const breadcrumbItems: BreadcrumbItem[] = task.project_id
    ? [
        { label: 'Projects', href: '/projects' },
        { label: task.project_title || 'Project', href: `/projects/${task.project_id}` },
        { label: 'Tasks', href: `/projects/${task.project_id}/tasks` },
        { label: task.title, current: true },
      ]
    : [
        { label: 'Tasks', href: '/tasks' },
        { label: task.title, current: true },
      ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} />

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{task.title}</h1>
              <Badge variant={config.variant}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {config.label}
              </Badge>
              {task.is_required && (
                <Badge variant="secondary">Required</Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              Task #{task.id}
              {task.project_title && ` | ${task.project_title}`}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Owner Actions */}
          {canStart && (
            <Button
              onClick={() => startTaskMutation.mutate()}
              disabled={startTaskMutation.isPending}
            >
              {startTaskMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Start Task
            </Button>
          )}

          {canSubmit && !isFormCompletionTask && !isDocumentUploadTask && (
            <Button
              onClick={() => setShowSubmitDialog(true)}
              disabled={submitTaskMutation.isPending}
            >
              {submitTaskMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Submit for Review
            </Button>
          )}

          {canRevise && (
            <Button
              variant="outline"
              onClick={() => reviseTaskMutation.mutate()}
              disabled={reviseTaskMutation.isPending}
            >
              {reviseTaskMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Edit className="mr-2 h-4 w-4" />
              )}
              Start Revision
            </Button>
          )}

          {/* Reviewer Actions */}
          {canReview && (
            <>
              <Button
                variant="default"
                onClick={() => approveTaskMutation.mutate(undefined)}
                disabled={approveTaskMutation.isPending}
              >
                {approveTaskMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ThumbsUp className="mr-2 h-4 w-4" />
                )}
                Approve
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowRevisionDialog(true)}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Request Revision
              </Button>
              <Button
                variant="destructive"
                onClick={() => setShowRejectDialog(true)}
              >
                <ThumbsDown className="mr-2 h-4 w-4" />
                Reject
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Overdue Warning */}
      {overdue && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">This task is overdue</span>
              <span className="text-sm text-muted-foreground ml-2">
                Due date was {formatDate(task.due_date)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reviewer Comments Alert - Show when there are comments */}
      {task.reviewer_comments && (task.status === 'rejected' || task.status === 'revision_required') && (
        <Card className={task.status === 'rejected' ? 'border-destructive bg-destructive/5' : 'border-amber-500 bg-amber-500/5'}>
          <CardHeader className="pb-2">
            <CardTitle className={`flex items-center gap-2 text-lg ${task.status === 'rejected' ? 'text-destructive' : 'text-amber-700'}`}>
              <MessageSquare className="h-5 w-5" />
              {task.status === 'rejected' ? 'Task Rejected' : 'Revision Required'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">
              {task.reviewed_by_name && `Reviewed by ${task.reviewed_by_name} on `}
              {formatDateTime(task.reviewed_at)}
            </p>
            <p className="text-sm whitespace-pre-wrap">{task.reviewer_comments}</p>
            {canRevise && (
              <p className="text-sm text-muted-foreground mt-3">
                Please address the feedback and {task.status === 'rejected' ? 'resubmit' : 'revise'} your task.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Task Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Task Information */}
          <Card>
            <CardHeader>
              <CardTitle>Task Details</CardTitle>
              {task.description && (
                <CardDescription>{task.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Task Type */}
                {typeConfig && TypeIcon && (
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-muted ${typeConfig.color}`}>
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Task Type</p>
                      <p className="font-medium">{typeConfig.label}</p>
                    </div>
                  </div>
                )}

                {/* Priority */}
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <AlertCircle className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Priority</p>
                    <Badge variant={priorityConf.variant}>{priorityConf.label}</Badge>
                  </div>
                </div>

                {/* Due Date */}
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-muted ${overdue ? 'text-destructive' : ''}`}>
                    <Calendar className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Due Date</p>
                    <p className={`font-medium ${overdue ? 'text-destructive' : ''}`}>
                      {formatDate(task.due_date)}
                    </p>
                  </div>
                </div>

                {/* Assigned To */}
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Assigned To</p>
                    <p className="font-medium">
                      {task.assigned_to_name || 'Unassigned'}
                    </p>
                  </div>
                </div>

                {/* Revision Count */}
                {task.revision_count > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted text-amber-500">
                      <RotateCcw className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Revisions</p>
                      <p className="font-medium">{task.revision_count}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Timestamps */}
              <Separator />
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Created: </span>
                  <span>{formatDateTime(task.created_at)}</span>
                </div>
                {task.updated_at && (
                  <div>
                    <span className="text-muted-foreground">Updated: </span>
                    <span>{formatDateTime(task.updated_at)}</span>
                  </div>
                )}
                {task.submitted_at && (
                  <div>
                    <span className="text-muted-foreground">Submitted: </span>
                    <span>{formatDateTime(task.submitted_at)}</span>
                  </div>
                )}
                {task.completed_at && (
                  <div>
                    <span className="text-muted-foreground">Completed: </span>
                    <span>{formatDateTime(task.completed_at)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Form Completion Task - Form Link */}
          {isFormCompletionTask && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Form Completion
                </CardTitle>
                <CardDescription>
                  {hasForm
                    ? 'Continue working on the linked form'
                    : 'Select a template to start the form'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {hasForm ? (
                  <div className="flex items-center justify-between p-4 rounded-lg border">
                    <div>
                      <p className="font-medium">{task.form_title || 'Form'}</p>
                      <p className="text-sm text-muted-foreground">Form ID: {task.form_instance_id}</p>
                    </div>
                    <Button asChild>
                      <Link to={`/forms/${task.form_instance_id}`}>
                        <FileText className="mr-2 h-4 w-4" />
                        Open Form
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No form linked yet</h3>
                    <p className="text-muted-foreground mt-1 mb-4">
                      Select a form template to get started
                    </p>
                    {(canStart || task.status === 'in_progress') && (
                      <Button asChild>
                        <Link to={`/tasks/${task.id}/select-form`}>
                          Select Form Template
                        </Link>
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Document Upload Task - File Upload */}
          {isDocumentUploadTask && task.project_id && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Document Upload
                </CardTitle>
                <CardDescription>
                  {task.status === 'submitted'
                    ? 'Your document is awaiting review'
                    : task.status === 'approved'
                    ? 'Your document has been approved'
                    : 'Upload required documents for this task'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Revision Required Alert */}
                {task.status === 'revision_required' && task.reviewer_comments && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Revision Required</AlertTitle>
                    <AlertDescription>{task.reviewer_comments}</AlertDescription>
                  </Alert>
                )}

                {/* Submitted Status Alert */}
                {task.status === 'submitted' && (
                  <Alert variant="warning" className="mb-4">
                    <Clock className="h-4 w-4" />
                    <AlertTitle>Awaiting Review</AlertTitle>
                    <AlertDescription>
                      Your document has been submitted and is pending review by an administrator.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Approved Status Alert */}
                {task.status === 'approved' && (
                  <Alert variant="success" className="mb-4">
                    <CheckCircle className="h-4 w-4" />
                    <AlertTitle>Approved</AlertTitle>
                    <AlertDescription>
                      Your document has been reviewed and approved.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Upload Dropzone - Show only for in_progress and revision_required statuses */}
                {(task.status === 'in_progress' || task.status === 'revision_required') && (
                  <UploadDropzone
                    taskId={task.id}
                    projectId={task.project_id}
                    fileCategory="irb_document"
                    onUploadComplete={() => {
                      queryClient.invalidateQueries({ queryKey: ['taskFiles', taskId] });
                      queryClient.invalidateQueries({ queryKey: ['task', taskId] });
                      // Also invalidate project-level queries so ProjectDetailPage updates
                      if (task?.project_id) {
                        queryClient.invalidateQueries({ queryKey: ['projectTasks', task.project_id] });
                        queryClient.invalidateQueries({ queryKey: ['projectTaskProgress', task.project_id] });
                      }
                    }}
                    disabled={!isOwner}
                  />
                )}

                {/* Uploaded Files Section */}
                {taskFilesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : taskFilesError ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <AlertCircle className="h-12 w-12 text-destructive mb-4" />
                    <p className="text-muted-foreground">Failed to load files</p>
                  </div>
                ) : taskFiles && taskFiles.length > 0 ? (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground">
                      Uploaded Files ({taskFiles.length})
                    </h4>
                    {taskFiles.map((file) => (
                      <FileCard
                        key={file.id}
                        file={file}
                        onPreview={() => {
                          setPreviewFile({
                            id: file.id,
                            filename: file.original_filename,
                            mime_type: file.mime_type,
                          });
                          setIsPreviewOpen(true);
                        }}
                        onDownload={() => {
                          window.open(filesApi.getPreviewUrl(file.id), '_blank');
                        }}
                        onDelete={
                          (task.status === 'in_progress' || task.status === 'revision_required') && isOwner
                            ? () => deleteFileMutation.mutate(file.id.toString())
                            : undefined
                        }
                      />
                    ))}
                  </div>
                ) : (task.status === 'in_progress' || task.status === 'revision_required') ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium">No documents uploaded</h3>
                    <p className="text-muted-foreground mt-1">
                      Upload the required documents to complete this task
                    </p>
                  </div>
                ) : null}

                {/* Submit for Review Button - Show only when in_progress with files */}
                {task.status === 'in_progress' && taskFiles && taskFiles.length > 0 && isOwner && (
                  <div className="pt-4 border-t">
                    <Button
                      className="w-full"
                      onClick={() => submitTaskMutation.mutate()}
                      disabled={submitTaskMutation.isPending}
                    >
                      {submitTaskMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Submit for Review
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Status History / Activity Log */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Activity Log
              </CardTitle>
              <CardDescription>
                Timeline of status changes and updates
              </CardDescription>
            </CardHeader>
            <CardContent>
              {statusHistory.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No activity recorded yet
                </p>
              ) : (
                <div className="space-y-4">
                  {statusHistory.map((item, index) => {
                    const itemConfig = statusConfig[item.status as TaskStatus] || {
                      label: item.status === 'created' ? 'Created' : item.status,
                      icon: Clock,
                      color: 'text-gray-500',
                    };
                    const ItemIcon = itemConfig.icon;

                    return (
                      <div key={index} className="flex gap-4">
                        <div className={`mt-1 ${itemConfig.color}`}>
                          <ItemIcon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 pb-4 border-b last:border-0 last:pb-0">
                          <div className="flex items-center justify-between">
                            <p className="font-medium capitalize">
                              {item.status === 'revision_required'
                                ? 'Revision Requested'
                                : itemConfig.label || item.status}
                            </p>
                            <span className="text-sm text-muted-foreground">
                              {formatDateTime(item.timestamp)}
                            </span>
                          </div>
                          {item.performed_by_name && (
                            <p className="text-sm text-muted-foreground">
                              by {item.performed_by_name}
                            </p>
                          )}
                          {item.comments && (
                            <p className="text-sm mt-2 p-2 rounded bg-muted">
                              {item.comments}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Related Information */}
        <div className="space-y-6">
          {/* Parent Project */}
          {task.project_id && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderKanban className="h-5 w-5" />
                  Project
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Link
                  to={`/projects/${task.project_id}`}
                  className="block p-4 rounded-lg border hover:bg-accent transition-colors"
                >
                  <p className="font-medium">{task.project_title || 'View Project'}</p>
                  <p className="text-sm text-muted-foreground">
                    Click to view project details
                  </p>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Linked Form (if form_completion) */}
          {task.form_instance_id && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Linked Form
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Link
                  to={`/forms/${task.form_instance_id}`}
                  className="block p-4 rounded-lg border hover:bg-accent transition-colors"
                >
                  <p className="font-medium">{task.form_title || 'View Form'}</p>
                  <p className="text-sm text-muted-foreground">
                    Form ID: {task.form_instance_id}
                  </p>
                </Link>
              </CardContent>
            </Card>
          )}

          {/* Task Status Card */}
          <Card>
            <CardHeader>
              <CardTitle>Current Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-full bg-muted ${config.color}`}>
                  <StatusIcon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-lg font-semibold">{config.label}</p>
                  {task.status === 'submitted' && (
                    <p className="text-sm text-muted-foreground">
                      Awaiting review
                    </p>
                  )}
                  {task.status === 'in_progress' && (
                    <p className="text-sm text-muted-foreground">
                      Task is being worked on
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Info */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created by</span>
                <span>{task.created_by_name || 'Unknown'}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Assigned to</span>
                <span>{task.assigned_to_name || 'Unassigned'}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Required</span>
                <span>{task.is_required ? 'Yes' : 'No'}</span>
              </div>
              {task.reviewed_by_name && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reviewed by</span>
                    <span>{task.reviewed_by_name}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Submit Confirmation Dialog */}
      <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit Task for Review</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to submit this task for review? Once submitted,
              you won't be able to make changes until the reviewer provides feedback.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => submitTaskMutation.mutate()}
              disabled={submitTaskMutation.isPending}
            >
              {submitTaskMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Task</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this task. The assignee will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reject_notes">
                Rejection Notes <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reject_notes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Explain why the task is being rejected..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                setReviewNotes('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejectTaskMutation.mutate(reviewNotes)}
              disabled={!reviewNotes.trim() || rejectTaskMutation.isPending}
            >
              {rejectTaskMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Reject Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Revision Dialog */}
      <Dialog open={showRevisionDialog} onOpenChange={setShowRevisionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Revision</DialogTitle>
            <DialogDescription>
              Please provide feedback on what needs to be revised. The assignee will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="revision_notes">
                Revision Notes <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="revision_notes"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Explain what changes are needed..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRevisionDialog(false);
                setReviewNotes('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => requestRevisionMutation.mutate(reviewNotes)}
              disabled={!reviewNotes.trim() || requestRevisionMutation.isPending}
            >
              {requestRevisionMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Request Revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Preview Modal */}
      <FilePreviewModal
        file={previewFile}
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewFile(null);
        }}
      />
    </div>
  );
}

export default TaskDetailPage;
