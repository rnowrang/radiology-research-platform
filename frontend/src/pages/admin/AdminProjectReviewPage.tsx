import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
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
  Eye,
  Trash2,
  MessageSquare,
  History,
  Play,
  UserPlus,
  Edit,
  Unlock,
  Plus,
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
import { useToast } from '@/hooks/useToast';
import { api, filesApi, tasksApi } from '@/lib/api';
import { ActivityFeed } from '@/components/activity';
import { CollaboratorsManagement } from '@/components/admin/CollaboratorsManagement';
import { FilePreviewModal } from '@/components/files/FilePreviewModal';
import { CreateTaskDialog } from '@/components/admin/CreateTaskDialog';
import { EditTaskDialog } from '@/components/admin/EditTaskDialog';
import { ReassignTaskDialog } from '@/components/admin/ReassignTaskDialog';

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
  task_type: string;
  status: string;
  priority: string;
  is_required: boolean;
  due_date?: string;
  completed_at?: string;
  created_at?: string;
  updated_at?: string;
  assigned_to: {
    id: string;
    name: string;
    email: string;
  } | null;
  created_by: {
    id: string;
    name: string;
  };
  reviewer_comments?: string;
  revision_count: number;
  files: Array<{
    id: string;
    original_file_name: string;
    mime_type: string;
  }>;
  status_history: Array<{
    status: string;
    timestamp: string;
    performed_by: string | null;
    comments: string | null;
  }>;
}

interface FileSummary {
  id: string;
  original_file_name: string;
  file_size: number;
  mime_type: string;
  category: string;
  uploaded_by_name?: string;
  created_at: string;
  task_id?: number;
  task_status?: string;
  task_title?: string;
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

const getTaskStatusBadgeVariant = (status?: string): 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' => {
  switch (status) {
    case 'submitted':
      return 'warning';
    case 'approved':
      return 'success';
    case 'rejected':
      return 'destructive';
    case 'revision_required':
      return 'secondary';
    case 'in_progress':
    default:
      return 'default';
  }
};

const getTaskStatusLabel = (status?: string): string => {
  if (!status) return '-';
  const labels: Record<string, string> = {
    pending: 'Pending',
    in_progress: 'In Progress',
    submitted: 'Submitted',
    approved: 'Approved',
    rejected: 'Rejected',
    revision_required: 'Revision Required',
    completed: 'Completed',
  };
  return labels[status] || status;
};

const getPriorityBadgeClasses = (priority: string): string => {
  switch (priority) {
    case 'urgent':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'high':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'low':
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const getPriorityLabel = (priority: string): string => {
  const labels: Record<string, string> = {
    urgent: 'Urgent',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  };
  return labels[priority] || priority;
};

// =============================================================================
// Component
// =============================================================================

export function AdminProjectReviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  // State
  const [activeTab, setActiveTab] = useState('overview');
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | 'request_changes' | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  // File preview state
  const [previewFile, setPreviewFile] = useState<{ id: string; filename: string; mime_type: string } | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // File delete state
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  // Task review dialog state
  const [taskReviewDialog, setTaskReviewDialog] = useState<{
    open: boolean;
    taskId: number | null;
    action: 'reject' | 'requestChanges' | null;
  }>({ open: false, taskId: null, action: null });
  const [taskReviewNotes, setTaskReviewNotes] = useState('');

  // Expanded task state
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

  // Task management state
  const [taskToDelete, setTaskToDelete] = useState<number | null>(null);
  const [assignTaskDialog, setAssignTaskDialog] = useState<{ open: boolean; taskId: number | null }>({ open: false, taskId: null });
  const [editTaskDialog, setEditTaskDialog] = useState<{ open: boolean; task: TaskSummary | null }>({ open: false, task: null });
  const [createTaskDialogOpen, setCreateTaskDialogOpen] = useState(false);

  // Fetch project review summary
  const {
    data: summaryData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['projectReviewSummary', projectId],
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID is required');
      const response = await projectReviewApi.getReviewSummary(projectId);
      return response.data.data as ProjectReviewSummary;
    },
    enabled: !!projectId,
    refetchOnWindowFocus: true,
  });

  // Mutations
  const approveMutation = useMutation({
    mutationFn: (notes?: string) => projectReviewApi.approve(projectId!, notes),
    onSuccess: async () => {
      setReviewDialogOpen(false);
      setReviewNotes('');
      setReviewAction(null);
      toast({ title: 'Project approved successfully' });
      await refetch();
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
    onSuccess: async () => {
      setReviewDialogOpen(false);
      setReviewNotes('');
      setReviewAction(null);
      toast({ title: 'Project rejected' });
      await refetch();
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
    onSuccess: async () => {
      setReviewDialogOpen(false);
      setReviewNotes('');
      setReviewAction(null);
      toast({ title: 'Changes requested' });
      await refetch();
    },
    onError: (err: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.response?.data?.error || 'Failed to request changes',
      });
    },
  });

  // Delete file mutation
  const deleteFileMutation = useMutation({
    mutationFn: (fileId: string) => filesApi.delete(fileId),
    onSuccess: async () => {
      toast({ title: 'File deleted' });
      setFileToDelete(null);
      await refetch();
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to delete file' });
    },
  });

  // Approve task mutation
  const approveTaskFromFileMutation = useMutation({
    mutationFn: (taskId: number) => tasksApi.approve(taskId),
    onSuccess: async () => {
      toast({ title: 'Task approved' });
      await refetch();
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to approve task' });
    },
  });

  // Reject task mutation
  const rejectTaskFromFileMutation = useMutation({
    mutationFn: ({ taskId, notes }: { taskId: number; notes: string }) =>
      tasksApi.reject(taskId, notes),
    onSuccess: async () => {
      toast({ title: 'Task rejected' });
      setTaskReviewDialog({ open: false, taskId: null, action: null });
      setTaskReviewNotes('');
      await refetch();
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to reject task' });
    },
  });

  // Request revision mutation
  const requestRevisionFromFileMutation = useMutation({
    mutationFn: ({ taskId, notes }: { taskId: number; notes: string }) =>
      tasksApi.requestRevision(taskId, notes),
    onSuccess: async () => {
      toast({ title: 'Revision requested' });
      setTaskReviewDialog({ open: false, taskId: null, action: null });
      setTaskReviewNotes('');
      await refetch();
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to request revision' });
    },
  });

  // Start task mutation
  const startTaskMutation = useMutation({
    mutationFn: (taskId: number) => tasksApi.start(taskId),
    onSuccess: async () => {
      toast({ title: 'Task started' });
      await refetch();
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to start task' });
    },
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: number) => tasksApi.delete(taskId),
    onSuccess: async () => {
      toast({ title: 'Task deleted' });
      setTaskToDelete(null);
      await refetch();
    },
    onError: (err: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to delete task',
        description: err.response?.data?.error || 'Cannot delete approved or completed tasks'
      });
      setTaskToDelete(null);
    },
  });

  // Reopen task mutation
  const reopenTaskMutation = useMutation({
    mutationFn: (taskId: number) => tasksApi.reopen(taskId),
    onSuccess: async () => {
      toast({ title: 'Task reopened' });
      await refetch();
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to reopen task' });
    },
  });

  // Unblock task mutation
  const unblockTaskMutation = useMutation({
    mutationFn: (taskId: number) => tasksApi.unblock(taskId),
    onSuccess: async () => {
      toast({ title: 'Task unblocked' });
      await refetch();
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to unblock task' });
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

  // Helper function to determine which actions are available based on task status
  const getTaskActions = (status: string): string[] => {
    switch (status) {
      case 'pending':
        return ['start', 'assign', 'edit', 'delete'];
      case 'in_progress':
        return ['reassign', 'edit'];
      case 'submitted':
        return ['approve', 'requestChanges', 'reject'];
      case 'approved':
      case 'completed':
        return []; // No actions - view only
      case 'rejected':
        return ['reopen', 'edit', 'delete'];
      case 'revision_required':
        return ['edit'];
      case 'blocked':
        return ['unblock', 'edit', 'delete'];
      case 'cancelled':
        return ['reopen', 'delete'];
      default:
        return [];
    }
  };

  // Render task action buttons based on status
  const renderTaskActions = (task: TaskSummary) => {
    const actions = getTaskActions(task.status);
    if (actions.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-2 pt-4 border-t mt-4">
        {actions.includes('start') && (
          <Button size="sm" onClick={() => startTaskMutation.mutate(task.id)} disabled={startTaskMutation.isPending}>
            <Play className="mr-1 h-4 w-4" /> Start
          </Button>
        )}
        {actions.includes('approve') && (
          <Button size="sm" variant="default" className="bg-green-600 hover:bg-green-700"
            onClick={() => approveTaskFromFileMutation.mutate(task.id)}>
            <CheckCircle className="mr-1 h-4 w-4" /> Approve
          </Button>
        )}
        {actions.includes('requestChanges') && (
          <Button size="sm" variant="outline" className="text-amber-600 border-amber-600"
            onClick={() => setTaskReviewDialog({ open: true, taskId: task.id, action: 'requestChanges' })}>
            <RotateCcw className="mr-1 h-4 w-4" /> Request Changes
          </Button>
        )}
        {actions.includes('reject') && (
          <Button size="sm" variant="destructive"
            onClick={() => setTaskReviewDialog({ open: true, taskId: task.id, action: 'reject' })}>
            <XCircle className="mr-1 h-4 w-4" /> Reject
          </Button>
        )}
        {actions.includes('assign') && (
          <Button size="sm" variant="outline" onClick={() => setAssignTaskDialog({ open: true, taskId: task.id })}>
            <UserPlus className="mr-1 h-4 w-4" /> Assign
          </Button>
        )}
        {actions.includes('reassign') && (
          <Button size="sm" variant="outline" onClick={() => setAssignTaskDialog({ open: true, taskId: task.id })}>
            <UserPlus className="mr-1 h-4 w-4" /> Reassign
          </Button>
        )}
        {actions.includes('edit') && (
          <Button size="sm" variant="outline" onClick={() => setEditTaskDialog({ open: true, task })}>
            <Edit className="mr-1 h-4 w-4" /> Edit
          </Button>
        )}
        {actions.includes('reopen') && (
          <Button size="sm" variant="outline" onClick={() => reopenTaskMutation.mutate(task.id)}>
            <RotateCcw className="mr-1 h-4 w-4" /> Reopen
          </Button>
        )}
        {actions.includes('unblock') && (
          <Button size="sm" variant="outline" onClick={() => unblockTaskMutation.mutate(task.id)}>
            <Unlock className="mr-1 h-4 w-4" /> Unblock
          </Button>
        )}
        {actions.includes('delete') && (
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
            onClick={() => setTaskToDelete(task.id)}>
            <Trash2 className="mr-1 h-4 w-4" /> Delete
          </Button>
        )}
      </div>
    );
  };

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
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Tasks</CardTitle>
                <CardDescription>
                  All tasks associated with this project
                </CardDescription>
              </div>
              <Button onClick={() => setCreateTaskDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create Task
              </Button>
            </CardHeader>
            <CardContent>
              {tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ListTodo className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No Tasks</h3>
                  <p className="text-muted-foreground mt-1">
                    No tasks have been assigned to this project yet
                  </p>
                  <Button className="mt-4" onClick={() => setCreateTaskDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create First Task
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {tasks.map((task) => {
                    const isExpanded = expandedTaskId === task.id;
                    return (
                      <div
                        key={task.id}
                        className="border rounded-lg"
                      >
                        {/* Task Header - Clickable to expand */}
                        <div
                          className="flex items-start gap-4 p-4 cursor-pointer hover:bg-accent/50 transition-colors"
                          onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                        >
                          {/* Left side - Title and metadata */}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-base mb-1 truncate">{task.title}</p>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                              <span className="font-medium text-foreground/70">{getTaskTypeLabel(task.task_type)}</span>
                              {task.assigned_to && (
                                <span className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {task.assigned_to.name}
                                </span>
                              )}
                              {task.due_date && !task.completed_at && (
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
                              {task.revision_count > 0 && (
                                <span className="flex items-center gap-1 text-amber-600">
                                  <RotateCcw className="h-3 w-3" />
                                  {task.revision_count} revision{task.revision_count > 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Right side - Badges and chevron */}
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={getStatusBadgeVariant(task.status)}>
                              {getStatusLabel(task.status)}
                            </Badge>
                            <Badge variant="outline" className={getPriorityBadgeClasses(task.priority)}>
                              {getPriorityLabel(task.priority)}
                            </Badge>
                            {task.is_required && (
                              <Badge variant="secondary">Required</Badge>
                            )}
                            <Button variant="ghost" size="icon" className="ml-1">
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4" />
                              ) : (
                                <ChevronDown className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && (
                          <div className="px-4 pb-4 border-t bg-muted/30 rounded-b-lg">
                            <div className="ml-4 space-y-4 pt-4">
                              {/* Description */}
                              {task.description && (
                                <div>
                                  <h4 className="text-sm font-medium mb-1">Description</h4>
                                  <p className="text-sm text-muted-foreground">{task.description}</p>
                                </div>
                              )}

                              {/* Details Grid */}
                              <div>
                                <h4 className="text-sm font-medium mb-2">Details</h4>
                                <div className="space-y-1.5 text-sm">
                                  {task.assigned_to && (
                                    <div className="flex items-center gap-2">
                                      <User className="h-4 w-4 text-muted-foreground" />
                                      <span className="text-muted-foreground">Assigned to:</span>
                                      <span>
                                        {task.assigned_to.name} ({task.assigned_to.email})
                                      </span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground ml-6">Priority:</span>
                                    <Badge
                                      variant="outline"
                                      className={getPriorityBadgeClasses(task.priority)}
                                    >
                                      {getPriorityLabel(task.priority)}
                                    </Badge>
                                  </div>
                                  {task.due_date && (
                                    <div className="flex items-center gap-2">
                                      <Calendar className="h-4 w-4 text-muted-foreground" />
                                      <span className="text-muted-foreground">Due:</span>
                                      <span>{formatDate(task.due_date)}</span>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-muted-foreground">Created by:</span>
                                    <span>{task.created_by.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-muted-foreground">Created:</span>
                                    <span>{formatDate(task.created_at)}</span>
                                    {task.updated_at && task.updated_at !== task.created_at && (
                                      <>
                                        <span className="text-muted-foreground mx-1">|</span>
                                        <span className="text-muted-foreground">Updated:</span>
                                        <span>{formatDate(task.updated_at)}</span>
                                      </>
                                    )}
                                  </div>
                                  {task.completed_at && (
                                    <div className="flex items-center gap-2 text-green-600">
                                      <CheckCircle className="h-4 w-4" />
                                      <span>Completed:</span>
                                      <span>{formatDate(task.completed_at)}</span>
                                    </div>
                                  )}
                                  {task.revision_count > 0 && (
                                    <div className="flex items-center gap-2">
                                      <RotateCcw className="h-4 w-4 text-muted-foreground" />
                                      <span className="text-muted-foreground">Revisions:</span>
                                      <span>{task.revision_count}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Files Section */}
                              {task.files && task.files.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <FileText className="h-4 w-4" />
                                    Files ({task.files.length})
                                  </h4>
                                  <div className="space-y-2">
                                    {task.files.map((file) => (
                                      <div
                                        key={file.id}
                                        className="flex items-center justify-between p-2 bg-background rounded border"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <File className="h-4 w-4 text-muted-foreground shrink-0" />
                                          <span className="text-sm truncate">
                                            {file.original_file_name}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setPreviewFile({
                                                id: file.id,
                                                filename: file.original_file_name,
                                                mime_type: file.mime_type,
                                              });
                                              setIsPreviewOpen(true);
                                            }}
                                            title="Preview"
                                          >
                                            <Eye className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              window.open(`/api/files/${file.id}`, '_blank');
                                            }}
                                            title="Download"
                                          >
                                            <Download className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Reviewer Comments Section */}
                              {task.reviewer_comments && (
                                <div>
                                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4" />
                                    Reviewer Comments
                                  </h4>
                                  <div className="p-3 bg-background rounded border italic text-sm">
                                    "{task.reviewer_comments}"
                                  </div>
                                </div>
                              )}

                              {/* Status History Section */}
                              {task.status_history && task.status_history.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                    <History className="h-4 w-4" />
                                    Status History
                                  </h4>
                                  <div className="space-y-2">
                                    {task.status_history.map((history, index) => (
                                      <div
                                        key={index}
                                        className="flex items-start gap-2 text-sm"
                                      >
                                        <div className="w-2 h-2 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                                        <div>
                                          <span className="text-muted-foreground">
                                            {formatDate(history.timestamp)}:
                                          </span>{' '}
                                          <Badge
                                            variant={getTaskStatusBadgeVariant(history.status)}
                                            className="text-xs"
                                          >
                                            {getTaskStatusLabel(history.status)}
                                          </Badge>
                                          {history.performed_by && (
                                            <span className="text-muted-foreground">
                                              {' '}by {history.performed_by}
                                            </span>
                                          )}
                                          {history.comments && (
                                            <p className="text-muted-foreground mt-0.5 italic">
                                              "{history.comments}"
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Task Actions - Added by Agent B */}
                              <div className="pt-2 border-t">
                                {renderTaskActions(task)}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                      {/* Left side - File info */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <File className="h-8 w-8 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            {file.original_file_name}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
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

                      {/* Right side - Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Task status badge */}
                        {file.task_id && file.task_status && (
                          <Badge variant={getTaskStatusBadgeVariant(file.task_status)}>
                            {getTaskStatusLabel(file.task_status)}
                          </Badge>
                        )}

                        {/* Preview button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setPreviewFile({
                              id: file.id,
                              filename: file.original_file_name,
                              mime_type: file.mime_type,
                            });
                            setIsPreviewOpen(true);
                          }}
                          title="Preview"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>

                        {/* Download button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(`/api/files/${file.id}`, '_blank')}
                          title="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>

                        {/* Delete button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setFileToDelete(file.id)}
                          title="Delete"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>

                        {/* Task review actions - only show for submitted tasks */}
                        {file.task_id && file.task_status === 'submitted' && (
                          <div className="flex items-center gap-1 ml-2 pl-2 border-l">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => approveTaskFromFileMutation.mutate(file.task_id!)}
                              disabled={approveTaskFromFileMutation.isPending}
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <CheckCircle className="mr-1 h-4 w-4" />
                              Approve
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setTaskReviewDialog({
                                open: true,
                                taskId: file.task_id!,
                                action: 'requestChanges',
                              })}
                              className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                            >
                              <RotateCcw className="mr-1 h-4 w-4" />
                              Request Changes
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setTaskReviewDialog({
                                open: true,
                                taskId: file.task_id!,
                                action: 'reject',
                              })}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <XCircle className="mr-1 h-4 w-4" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
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

      {/* Delete File Confirmation Dialog */}
      <AlertDialog open={!!fileToDelete} onOpenChange={() => setFileToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this file? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => fileToDelete && deleteFileMutation.mutate(fileToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Task Review Dialog (for reject/request changes - needs notes) */}
      <Dialog
        open={taskReviewDialog.open}
        onOpenChange={(open) => !open && setTaskReviewDialog({ open: false, taskId: null, action: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {taskReviewDialog.action === 'reject' ? 'Reject Task' : 'Request Changes'}
            </DialogTitle>
            <DialogDescription>
              Please provide feedback for the task owner.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Notes (required)</Label>
            <Textarea
              value={taskReviewNotes}
              onChange={(e) => setTaskReviewNotes(e.target.value)}
              placeholder="Enter your feedback..."
              rows={4}
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTaskReviewDialog({ open: false, taskId: null, action: null })}
            >
              Cancel
            </Button>
            <Button
              variant={taskReviewDialog.action === 'reject' ? 'destructive' : 'default'}
              onClick={() => {
                if (taskReviewDialog.taskId && taskReviewNotes.trim()) {
                  if (taskReviewDialog.action === 'reject') {
                    rejectTaskFromFileMutation.mutate({
                      taskId: taskReviewDialog.taskId,
                      notes: taskReviewNotes,
                    });
                  } else {
                    requestRevisionFromFileMutation.mutate({
                      taskId: taskReviewDialog.taskId,
                      notes: taskReviewNotes,
                    });
                  }
                }
              }}
              disabled={!taskReviewNotes.trim() || rejectTaskFromFileMutation.isPending || requestRevisionFromFileMutation.isPending}
            >
              {(rejectTaskFromFileMutation.isPending || requestRevisionFromFileMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {taskReviewDialog.action === 'reject' ? 'Reject' : 'Request Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Task Confirmation Dialog */}
      <AlertDialog open={!!taskToDelete} onOpenChange={() => setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this task? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => taskToDelete && deleteTaskMutation.mutate(taskToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* File Preview Modal */}
      <FilePreviewModal
        file={previewFile}
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewFile(null);
        }}
      />

      {/* Create Task Dialog */}
      <CreateTaskDialog
        projectId={projectId!}
        open={createTaskDialogOpen}
        onOpenChange={setCreateTaskDialogOpen}
        onSuccess={refetch}
      />

      {/* Edit Task Dialog */}
      <EditTaskDialog
        task={editTaskDialog.task}
        open={editTaskDialog.open}
        onOpenChange={(open) => !open && setEditTaskDialog({ open: false, task: null })}
        onSuccess={refetch}
      />

      {/* Assign/Reassign Task Dialog */}
      <ReassignTaskDialog
        taskId={assignTaskDialog.taskId}
        projectId={projectId!}
        open={assignTaskDialog.open}
        onOpenChange={(open) => !open && setAssignTaskDialog({ open: false, taskId: null })}
        onSuccess={refetch}
      />
    </div>
  );
}
