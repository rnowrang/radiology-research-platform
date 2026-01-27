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
  CheckSquare,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  User,
  Send,
  ThumbsUp,
  ThumbsDown,
  XCircle,
  Info,
  ListTodo,
  Activity,
  File,
  Eye,
  Download,
  Settings,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/useToast';
import { useAuthStore } from '@/stores/authStore';
import { projectsApi, formsApi, api, tasksApi, filesApi } from '@/lib/api';
import { ActivityFeed } from '@/components/activity';
import { AssignTaskDialog } from '@/components/admin/AssignTaskDialog';
import { AddTaskToProjectDialog } from '@/components/admin/AddTaskToProjectDialog';
import { FilePreviewModal } from '@/components/files/FilePreviewModal';

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
  // Approval workflow fields
  submitted_for_approval_at?: string;
  approved_at?: string;
  approved_by_id?: string;
  rejected_at?: string;
  rejected_by_id?: string;
  rejection_notes?: string;
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

interface ProjectTask {
  id: number;
  title: string;
  description?: string;
  task_type?: string;
  status: string;
  priority: string;
  is_required: boolean;
  assigned_to_id?: string;
  assigned_to_name?: string;
  due_date?: string;
  completed_at?: string;
  submitted_at?: string;
  revision_count: number;
  reviewer_comments?: string;
  created_at: string;
  form_instance_id?: number;
}

interface TaskProgress {
  project_id: string;
  total_tasks: number;
  completed_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
  submitted_tasks: number;
  approved_tasks: number;
  rejected_tasks: number;
  revision_required_tasks: number;
  completion_percentage: number;
  tasks: any[];
}

interface CustomTaskFormData {
  title: string;
  description: string;
  task_type: string;
  assigned_to_id: string;
  due_date: string;
  is_required: boolean;
}

interface ProjectFile {
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

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  pending_approval: { label: 'Pending Approval', variant: 'outline' },
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  needs_changes: { label: 'Needs Changes', variant: 'outline' },
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

const taskStatusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }> = {
  pending: { label: 'Pending', variant: 'secondary', icon: Clock },
  in_progress: { label: 'In Progress', variant: 'default', icon: Clock },
  submitted: { label: 'Submitted', variant: 'default', icon: Clock },
  approved: { label: 'Approved', variant: 'outline', icon: CheckCircle },
  rejected: { label: 'Rejected', variant: 'destructive', icon: AlertCircle },
  revision_required: { label: 'Revision Required', variant: 'destructive', icon: AlertCircle },
  completed: { label: 'Completed', variant: 'outline', icon: CheckCircle },
  blocked: { label: 'Blocked', variant: 'destructive', icon: AlertCircle },
  cancelled: { label: 'Cancelled', variant: 'outline', icon: AlertCircle },
};

const taskTypes = [
  { value: 'document_upload', label: 'Document Upload' },
  { value: 'form_completion', label: 'Form Completion' },
  { value: 'approval_required', label: 'Approval Required' },
  { value: 'general', label: 'General' },
];

const taskTypeLabels: Record<string, string> = {
  document_upload: 'Document Upload',
  form_completion: 'Form Completion',
  approval_required: 'Approval Required',
  general: 'General',
};

// API functions for project tasks
const projectTasksApi = {
  list: (projectId: string) => api.get(`/projects/${projectId}/tasks`),
  getProgress: (projectId: string) => api.get(`/projects/${projectId}/task-progress`),
  create: (projectId: string, data: any) => api.post(`/projects/${projectId}/tasks`, data),
  update: (taskId: number, data: any) => api.put(`/tasks/${taskId}`, data),
  submit: (taskId: number) => api.post(`/tasks/${taskId}/submit`),
  complete: (taskId: number) => api.post(`/tasks/${taskId}/complete`),
};

// Helper functions
const formatDate = (dateStr?: string) => {
  if (!dateStr) return 'Not set';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

const getTaskStatusBadgeVariant = (status?: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (status) {
    case 'submitted':
      return 'default';
    case 'approved':
    case 'completed':
      return 'outline';
    case 'rejected':
    case 'revision_required':
      return 'destructive';
    case 'in_progress':
      return 'default';
    default:
      return 'secondary';
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

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState('overview');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showCreateTaskDialog, setShowCreateTaskDialog] = useState(false);
  const [showAssignTaskDialog, setShowAssignTaskDialog] = useState(false);
  const [showAddTaskDialog, setShowAddTaskDialog] = useState(false);
  const [showDeleteTaskDialog, setShowDeleteTaskDialog] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<ProjectTask | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [newTask, setNewTask] = useState<CustomTaskFormData>({
    title: '',
    description: '',
    task_type: 'document_upload',
    assigned_to_id: '',
    due_date: '',
    is_required: false,
  });

  // File preview state
  const [previewFile, setPreviewFile] = useState<{ id: string; filename: string; mime_type: string } | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

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

  const { data: tasks, isLoading: tasksLoading } = useQuery({
    queryKey: ['projectTasks', id],
    queryFn: async () => {
      const response = await projectTasksApi.list(id!);
      return response.data.data as ProjectTask[];
    },
    enabled: !!id,
  });

  const { data: taskProgress } = useQuery({
    queryKey: ['projectTaskProgress', id],
    queryFn: async () => {
      const response = await projectTasksApi.getProgress(id!);
      return response.data.data as TaskProgress;
    },
    enabled: !!id,
  });

  const { data: filesData, isLoading: filesLoading } = useQuery({
    queryKey: ['projectFiles', id],
    queryFn: async () => {
      const response = await filesApi.listProjectFiles(id!);
      return response.data.data as ProjectFile[];
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

  // Project approval workflow mutations
  const submitForApprovalMutation = useMutation({
    mutationFn: () => projectsApi.submitForApproval(id!),
    onSuccess: () => {
      toast({
        title: 'Project submitted for approval',
        description: 'Your project has been submitted for admin review',
      });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['adminProjectReviewCount'] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || error.response?.data?.detail || 'Failed to submit project for approval',
      });
    },
  });

  const approveProjectMutation = useMutation({
    mutationFn: () => projectsApi.approve(id!),
    onSuccess: () => {
      toast({
        title: 'Project approved',
        description: 'The project has been approved successfully',
      });
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['adminProjectReviewCount'] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || error.response?.data?.detail || 'Failed to approve project',
      });
    },
  });

  const rejectProjectMutation = useMutation({
    mutationFn: (notes: string) => projectsApi.reject(id!, notes),
    onSuccess: () => {
      toast({
        title: 'Project rejected',
        description: 'The project has been rejected',
      });
      setShowRejectDialog(false);
      setRejectionNotes('');
      queryClient.invalidateQueries({ queryKey: ['project', id] });
      queryClient.invalidateQueries({ queryKey: ['adminProjectReviewCount'] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || error.response?.data?.detail || 'Failed to reject project',
      });
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (data: CustomTaskFormData) => projectTasksApi.create(id!, {
      ...data,
      due_date: data.due_date || undefined,
      assigned_to_id: data.assigned_to_id || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTasks', id] });
      queryClient.invalidateQueries({ queryKey: ['projectTaskProgress', id] });
      setShowCreateTaskDialog(false);
      setNewTask({
        title: '',
        description: '',
        task_type: 'document_upload',
        assigned_to_id: '',
        due_date: '',
        is_required: false,
      });
      toast({ title: 'Task created successfully' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to create task',
      });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, data }: { taskId: number; data: any }) =>
      projectTasksApi.update(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTasks', id] });
      queryClient.invalidateQueries({ queryKey: ['projectTaskProgress', id] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update task',
      });
    },
  });

  const submitTaskMutation = useMutation({
    mutationFn: (taskId: number) => projectTasksApi.submit(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTasks', id] });
      queryClient.invalidateQueries({ queryKey: ['projectTaskProgress', id] });
      toast({ title: 'Task submitted for review' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to submit task',
      });
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: (taskId: number) => projectTasksApi.complete(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTasks', id] });
      queryClient.invalidateQueries({ queryKey: ['projectTaskProgress', id] });
      toast({ title: 'Task completed' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to complete task',
      });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: number) => tasksApi.delete(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTasks', id] });
      queryClient.invalidateQueries({ queryKey: ['projectTaskProgress', id] });
      setShowDeleteTaskDialog(false);
      setTaskToDelete(null);
      toast({ title: 'Task deleted successfully' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to delete task',
      });
    },
  });

  const handleDeleteTask = (task: ProjectTask) => {
    setTaskToDelete(task);
    setShowDeleteTaskDialog(true);
  };

  const confirmDeleteTask = () => {
    if (taskToDelete) {
      deleteTaskMutation.mutate(taskToDelete.id);
    }
  };

  const isOwner = user?.id === project?.principal_investigator_id;
  const isAdmin = user?.role === 'admin';
  const canManageTasks = isOwner || isAdmin;
  const projectTasks = tasks || [];
  const projectFiles = filesData || [];
  const progress = taskProgress || {
    project_id: '',
    total_tasks: 0,
    completed_tasks: 0,
    pending_tasks: 0,
    in_progress_tasks: 0,
    submitted_tasks: 0,
    approved_tasks: 0,
    rejected_tasks: 0,
    revision_required_tasks: 0,
    completion_percentage: 0,
    tasks: [],
  };

  // Check if all required tasks are completed (for submit for approval eligibility)
  const allRequiredTasksCompleted = projectTasks.length === 0 || projectTasks.every(task => {
    // If task is not required, it doesn't block submission
    if (!task.is_required) return true;
    // Required tasks must be completed or approved
    return ['completed', 'approved'].includes(task.status);
  });

  // Can submit for approval: PI or admin, project status allows it, and all required tasks done
  const canSubmitForApproval = (isOwner || isAdmin) &&
    ['draft', 'active', 'rejected'].includes(project?.status || '') &&
    allRequiredTasksCompleted;

  // Can admin review: admin only, project is pending_approval
  const canAdminReview = isAdmin && project?.status === 'pending_approval';

  const handleCreateTask = () => {
    if (!newTask.title.trim()) {
      toast({ variant: 'destructive', title: 'Task title is required' });
      return;
    }
    createTaskMutation.mutate(newTask);
  };

  const handleTaskClick = (task: ProjectTask) => {
    // For completed/approved tasks, allow viewing associated content
    if (['completed', 'approved'].includes(task.status)) {
      if (task.task_type === 'form_completion' && task.form_instance_id) {
        navigate(`/forms/${task.form_instance_id}/view`);
      } else if (task.task_type === 'document_upload') {
        // Allow viewing uploaded files for completed document upload tasks
        navigate(`/tasks/${task.id}`);
      }
      return;
    }

    if (task.task_type === 'form_completion') {
      if (task.form_instance_id) {
        navigate(`/forms/${task.form_instance_id}`);
      } else {
        navigate(`/tasks/${task.id}/select-form`);
      }
    } else {
      // For document_upload and other types, go to task detail
      navigate(`/tasks/${task.id}`);
    }
  };

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

        <div className="flex items-center gap-2">
          {/* Submit for Approval Button - Researcher */}
          {canSubmitForApproval && (
            <Button
              onClick={() => submitForApprovalMutation.mutate()}
              disabled={submitForApprovalMutation.isPending}
            >
              {submitForApprovalMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Submit for Approval
            </Button>
          )}

          {/* Research Intelligence Button (Unified Assistant) */}
          <Button variant="outline" asChild>
            <Link to={`/projects/${id}/intelligence`}>
              <Sparkles className="mr-2 h-4 w-4" />
              Research Intelligence
            </Link>
          </Button>

          {/* Admin Review Buttons */}
          {canAdminReview && (
            <>
              <Button
                variant="default"
                onClick={() => approveProjectMutation.mutate()}
                disabled={approveProjectMutation.isPending}
              >
                {approveProjectMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ThumbsUp className="mr-2 h-4 w-4" />
                )}
                Approve
              </Button>
              <Button
                variant="destructive"
                onClick={() => setShowRejectDialog(true)}
                disabled={rejectProjectMutation.isPending}
              >
                <ThumbsDown className="mr-2 h-4 w-4" />
                Reject
              </Button>
            </>
          )}

          {(isOwner || isAdmin) && (
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
      </div>

      {/* Rejection Notes Alert - Show when project is rejected */}
      {project.status === 'rejected' && project.rejection_notes && (
        <Card className="border-destructive bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-destructive flex items-center gap-2 text-lg">
              <XCircle className="h-5 w-5" />
              Project Rejected
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">
              Rejected on {formatDate(project.rejected_at)}
            </p>
            <p className="text-sm">{project.rejection_notes}</p>
            {canSubmitForApproval && (
              <p className="text-sm text-muted-foreground mt-3">
                Please address the feedback and resubmit your project for approval.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Pending Approval Info - Show when waiting for admin review */}
      {project.status === 'pending_approval' && !isAdmin && (
        <Card className="border-yellow-500 bg-yellow-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-yellow-700 flex items-center gap-2 text-lg">
              <Clock className="h-5 w-5" />
              Pending Admin Approval
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your project was submitted for approval on {formatDate(project.submitted_for_approval_at)}.
              An administrator will review it shortly.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Approved Info - Show when project is approved */}
      {project.status === 'approved' && (
        <Card className="border-green-500 bg-green-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-green-700 flex items-center gap-2 text-lg">
              <CheckCircle className="h-5 w-5" />
              Project Approved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              This project was approved on {formatDate(project.approved_at)}.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Progress Bar Section */}
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
                  <strong>{projectForms.length}</strong> Forms
                </span>
              </div>
              <div className="flex items-center gap-2">
                <File className="h-4 w-4 text-muted-foreground" />
                <span>
                  <strong>{projectFiles.length}</strong> Files
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <Info className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-2">
            <ListTodo className="h-4 w-4" />
            Tasks ({projectTasks.length})
          </TabsTrigger>
          <TabsTrigger value="forms" className="gap-2">
            <FileText className="h-4 w-4" />
            Forms ({projectForms.length})
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-2">
            <File className="h-4 w-4" />
            Files ({projectFiles.length})
          </TabsTrigger>
          <TabsTrigger value="collaborators" className="gap-2">
            <Users className="h-4 w-4" />
            Collaborators ({project.collaborators.length})
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-2">
            <Activity className="h-4 w-4" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-6">
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
                    <p className="font-medium">{project.project_type ? projectTypes[project.project_type] : '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Department</span>
                    <p className="font-medium">{project.department || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Start Date</span>
                    <p className="font-medium">{formatDate(project.start_date)}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">End Date</span>
                    <p className="font-medium">{formatDate(project.end_date)}</p>
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

            {/* Review Summary */}
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
                    {projectForms.filter(f => f.status !== 'draft').length}/{projectForms.length}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm font-medium">Documents Uploaded</span>
                  <span className="font-bold">{projectFiles.length}</span>
                </div>
                {progress.completion_percentage < 100 && progress.total_tasks > 0 && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                    <p className="text-sm text-amber-700">
                      Some tasks are still incomplete. Complete all required tasks before submitting for approval.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

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

        <TabsContent value="tasks" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Project Tasks</CardTitle>
                <CardDescription>Tasks and requirements for this project</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Button variant="outline" onClick={() => setShowAssignTaskDialog(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Assign Task
                  </Button>
                )}
                {canManageTasks && (
                  <Button onClick={() => setShowAddTaskDialog(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Task
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {tasksLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : projectTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CheckSquare className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No tasks yet</h3>
                  <p className="text-muted-foreground mt-1">
                    Tasks will be created automatically when the project is set up
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {projectTasks.map((task) => {
                    const taskConfig = taskStatusConfig[task.status] || taskStatusConfig.pending;
                    const StatusIcon = taskConfig.icon;
                    const isOverdue = task.due_date &&
                      !['completed', 'approved', 'cancelled'].includes(task.status) &&
                      new Date(task.due_date) < new Date();

                    return (
                      <div
                        key={task.id}
                        className={`flex items-center gap-4 p-4 border rounded-lg cursor-pointer hover:bg-accent transition-colors ${
                          isOverdue ? 'border-destructive bg-destructive/5' : ''
                        }`}
                        onClick={() => handleTaskClick(task)}
                      >
                        <Checkbox
                          checked={['completed', 'approved'].includes(task.status)}
                          onCheckedChange={(checked) => {
                            if (checked && !['completed', 'approved'].includes(task.status)) {
                              completeTaskMutation.mutate(task.id);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          disabled={['completed', 'approved', 'submitted'].includes(task.status)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${
                              ['completed', 'approved'].includes(task.status) ? 'line-through text-muted-foreground' : ''
                            }`}>
                              {task.title}
                            </span>
                            {task.is_required && (
                              <Badge variant="secondary" className="text-xs">Required</Badge>
                            )}
                            {task.task_type && (
                              <Badge variant="outline" className="text-xs">
                                {taskTypeLabels[task.task_type] || task.task_type}
                              </Badge>
                            )}
                            {task.revision_count > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                Revision #{task.revision_count}
                              </Badge>
                            )}
                          </div>
                          {task.description && (
                            <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                              {task.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            {task.assigned_to_name && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {task.assigned_to_name}
                              </span>
                            )}
                            {task.due_date && (
                              <span className={`flex items-center gap-1 ${isOverdue ? 'text-destructive' : ''}`}>
                                <Calendar className="h-3 w-3" />
                                {isOverdue ? 'Overdue: ' : 'Due: '}
                                {formatDate(task.due_date)}
                              </span>
                            )}
                          </div>
                          {task.reviewer_comments && (
                            <p className="text-xs text-amber-600 mt-2">
                              Reviewer: {task.reviewer_comments}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={taskConfig.variant}>
                            <StatusIcon className="mr-1 h-3 w-3" />
                            {taskConfig.label}
                          </Badge>
                          {task.status === 'in_progress' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                submitTaskMutation.mutate(task.id);
                              }}
                              disabled={submitTaskMutation.isPending}
                            >
                              Submit
                            </Button>
                          )}
                          {task.status === 'pending' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateTaskMutation.mutate({
                                  taskId: task.id,
                                  data: { status: 'in_progress' },
                                });
                              }}
                              disabled={updateTaskMutation.isPending}
                            >
                              Start
                            </Button>
                          )}
                          {task.status === 'revision_required' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateTaskMutation.mutate({
                                  taskId: task.id,
                                  data: { status: 'in_progress' },
                                });
                              }}
                              disabled={updateTaskMutation.isPending}
                            >
                              Revise
                            </Button>
                          )}
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTask(task);
                              }}
                              disabled={deleteTaskMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Files Tab */}
        <TabsContent value="files" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Project Files</CardTitle>
              <CardDescription>
                All files uploaded for this project
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filesLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : projectFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <File className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No Files</h3>
                  <p className="text-muted-foreground mt-1">
                    No files have been uploaded to this project yet
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {projectFiles.map((file) => (
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
                      </div>
                    </div>
                  ))}
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

      {/* Create Custom Task Dialog */}
      <Dialog open={showCreateTaskDialog} onOpenChange={setShowCreateTaskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Custom Task</DialogTitle>
            <DialogDescription>
              Add a custom task to this project
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="task_title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="task_title"
                value={newTask.title}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Task title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task_description">Description</Label>
              <Textarea
                id="task_description"
                value={newTask.description}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="Task description"
                rows={3}
              />
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="task_type">Task Type</Label>
                <Select
                  value={newTask.task_type}
                  onValueChange={(value) =>
                    setNewTask((prev) => ({ ...prev, task_type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {taskTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assigned_to">Assign To (optional)</Label>
                <Select
                  value={newTask.assigned_to_id}
                  onValueChange={(value) =>
                    setNewTask((prev) => ({ ...prev, assigned_to_id: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select collaborator" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {project.collaborators.map((collab) => (
                      <SelectItem key={collab.user_id} value={collab.user_id}>
                        {collab.user_id.slice(0, 8)}...
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task_due_date">Due Date (optional)</Label>
              <Input
                id="task_due_date"
                type="date"
                value={newTask.due_date}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, due_date: e.target.value }))
                }
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="task_required"
                checked={newTask.is_required}
                onCheckedChange={(checked) =>
                  setNewTask((prev) => ({ ...prev, is_required: checked as boolean }))
                }
              />
              <Label htmlFor="task_required" className="text-sm font-normal">
                Mark as required task
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateTaskDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTask}
              disabled={createTaskMutation.isPending}
            >
              {createTaskMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Task Dialog (Admin only) */}
      <AssignTaskDialog
        open={showAssignTaskDialog}
        onOpenChange={setShowAssignTaskDialog}
        projectId={id}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['projectTasks', id] });
          queryClient.invalidateQueries({ queryKey: ['projectTaskProgress', id] });
        }}
      />

      {/* Add Task to Project Dialog */}
      {id && (
        <AddTaskToProjectDialog
          projectId={id}
          open={showAddTaskDialog}
          onOpenChange={setShowAddTaskDialog}
          onTaskAdded={() => {
            queryClient.invalidateQueries({ queryKey: ['projectTasks', id] });
            queryClient.invalidateQueries({ queryKey: ['projectTaskProgress', id] });
          }}
          collaborators={project?.collaborators?.map((c) => ({
            id: c.id,
            user_id: c.user_id,
            role: c.role,
          }))}
        />
      )}

      {/* Delete Task Confirmation Dialog */}
      <AlertDialog open={showDeleteTaskDialog} onOpenChange={setShowDeleteTaskDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the task "{taskToDelete?.title}"? This action cannot be undone.
              {taskToDelete?.status === 'in_progress' && (
                <span className="block mt-2 text-amber-600">
                  Warning: This task is currently in progress.
                </span>
              )}
              {taskToDelete?.status === 'submitted' && (
                <span className="block mt-2 text-amber-600">
                  Warning: This task has been submitted for review.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTaskToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteTask}
              disabled={deleteTaskMutation.isPending}
            >
              {deleteTaskMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete Task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Project Dialog (Admin only) */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Project</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this project. The researcher will be notified and can address the feedback before resubmitting.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rejection_notes">
                Rejection Notes <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="rejection_notes"
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
                placeholder="Explain why the project is being rejected and what changes are needed..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                setRejectionNotes('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejectProjectMutation.mutate(rejectionNotes)}
              disabled={!rejectionNotes.trim() || rejectProjectMutation.isPending}
            >
              {rejectProjectMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Reject Project
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
