import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle,
  XCircle,
  RotateCcw,
  Clock,
  FileText,
  User,
  Calendar,
  FolderKanban,
  Loader2,
  Eye,
  ExternalLink,
  File,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/useToast';
import { api } from '@/lib/api';
import { AssignTaskDialog } from '@/components/admin/AssignTaskDialog';

// Types
interface SubmittedTask {
  id: number;
  title: string;
  description?: string;
  task_type?: string;
  status: string;
  project_id?: string;
  project_title?: string;
  project_type?: string;
  assigned_to_id?: string;
  assigned_to_name?: string;
  submitted_by_id?: string;
  submitted_by_name?: string;
  submitted_at?: string;
  due_date?: string;
  is_required: boolean;
  revision_count: number;
  reviewer_comments?: string;
  files?: TaskFile[];
  created_at: string;
}

interface TaskFile {
  id: string;
  original_file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

// API functions
const taskReviewApi = {
  getPendingReview: (params?: { project_type?: string; task_type?: string; page?: number; limit?: number }) =>
    api.get('/tasks/pending-review', { params }),
  approve: (taskId: number, comments?: string) =>
    api.post(`/tasks/${taskId}/approve`, { comments }),
  reject: (taskId: number, comments: string) =>
    api.post(`/tasks/${taskId}/reject`, { comments }),
  requestRevision: (taskId: number, comments: string) =>
    api.post(`/tasks/${taskId}/request-revision`, { comments }),
};

// Task types
const taskTypes = [
  { value: 'document_upload', label: 'Document Upload' },
  { value: 'form_completion', label: 'Form Completion' },
  { value: 'approval_required', label: 'Approval Required' },
];

// Project types - must match database values
const projectTypes = [
  { value: 'retrospective', label: 'Retrospective Study' },
  { value: 'prospective', label: 'Prospective Study' },
  { value: 'clinical_trial', label: 'Clinical Trial' },
  { value: 'quality_improvement', label: 'Quality Improvement' },
  { value: 'educational_research', label: 'Educational Research' },
  { value: 'other', label: 'Other' },
];

const taskTypeLabels: Record<string, string> = {
  document_upload: 'Document Upload',
  form_completion: 'Form Completion',
  approval_required: 'Approval Required',
};

const formatDate = (dateStr?: string) => {
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

export function TaskReviewPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filter state
  const [projectTypeFilter, setProjectTypeFilter] = useState<string>('all');
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  // Review dialog state
  const [selectedTask, setSelectedTask] = useState<SubmittedTask | null>(null);
  const [reviewComments, setReviewComments] = useState('');
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | 'revision' | null>(null);

  // Assign task dialog state
  const [showAssignTaskDialog, setShowAssignTaskDialog] = useState(false);

  // Fetch submitted tasks
  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['pendingTasks', projectTypeFilter, taskTypeFilter, page, limit],
    queryFn: async () => {
      const params: Record<string, any> = { page, limit };
      if (projectTypeFilter !== 'all') params.project_type = projectTypeFilter;
      if (taskTypeFilter !== 'all') params.task_type = taskTypeFilter;
      const response = await taskReviewApi.getPendingReview(params);
      return response.data;
    },
  });

  const tasks: SubmittedTask[] = tasksData?.data || [];
  const pagination = tasksData?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 };

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: ({ taskId, comments }: { taskId: number; comments?: string }) =>
      taskReviewApi.approve(taskId, comments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingTasks'] });
      setSelectedTask(null);
      setReviewComments('');
      setReviewAction(null);
      toast({ title: 'Task approved successfully' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to approve task',
      });
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ taskId, comments }: { taskId: number; comments: string }) =>
      taskReviewApi.reject(taskId, comments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingTasks'] });
      setSelectedTask(null);
      setReviewComments('');
      setReviewAction(null);
      toast({ title: 'Task rejected' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to reject task',
      });
    },
  });

  // Request revision mutation
  const requestRevisionMutation = useMutation({
    mutationFn: ({ taskId, comments }: { taskId: number; comments: string }) =>
      taskReviewApi.requestRevision(taskId, comments),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingTasks'] });
      setSelectedTask(null);
      setReviewComments('');
      setReviewAction(null);
      toast({ title: 'Revision requested' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to request revision',
      });
    },
  });

  const handleOpenReview = (task: SubmittedTask) => {
    setSelectedTask(task);
    setReviewComments('');
    setReviewAction(null);
  };

  const handleSubmitReview = () => {
    if (!selectedTask || !reviewAction) return;

    if (reviewAction === 'approve') {
      approveMutation.mutate({
        taskId: selectedTask.id,
        comments: reviewComments || undefined,
      });
    } else if (reviewAction === 'reject') {
      if (!reviewComments.trim()) {
        toast({ variant: 'destructive', title: 'Comments are required when rejecting' });
        return;
      }
      rejectMutation.mutate({
        taskId: selectedTask.id,
        comments: reviewComments,
      });
    } else if (reviewAction === 'revision') {
      if (!reviewComments.trim()) {
        toast({ variant: 'destructive', title: 'Comments are required when requesting revision' });
        return;
      }
      requestRevisionMutation.mutate({
        taskId: selectedTask.id,
        comments: reviewComments,
      });
    }
  };

  const isSubmitting =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    requestRevisionMutation.isPending;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin">
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Task Review Queue</h1>
          <p className="text-muted-foreground">
            Review and approve submitted tasks
          </p>
        </div>
        <Button onClick={() => setShowAssignTaskDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Assign Task to Project
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select
                value={projectTypeFilter}
                onValueChange={(value) => {
                  setProjectTypeFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Project Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Project Types</SelectItem>
                  {projectTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={taskTypeFilter}
                onValueChange={(value) => {
                  setTaskTypeFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Task Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Task Types</SelectItem>
                  {taskTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tasks List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Pending Review
          </CardTitle>
          <CardDescription>
            {pagination.total} task{pagination.total !== 1 ? 's' : ''} awaiting review
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
              <h3 className="text-lg font-medium">All caught up!</h3>
              <p className="text-muted-foreground mt-1">
                No tasks pending review
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{task.title}</span>
                      {task.task_type && (
                        <Badge variant="outline">
                          {taskTypeLabels[task.task_type] || task.task_type}
                        </Badge>
                      )}
                      {task.is_required && (
                        <Badge variant="secondary">Required</Badge>
                      )}
                      {task.revision_count > 0 && (
                        <Badge variant="destructive">
                          Revision #{task.revision_count}
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      {task.project_title && (
                        <span className="flex items-center gap-1">
                          <FolderKanban className="h-3 w-3" />
                          {task.project_title}
                        </span>
                      )}
                      {task.submitted_by_name && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {task.submitted_by_name}
                        </span>
                      )}
                      {task.submitted_at && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(task.submitted_at)}
                        </span>
                      )}
                      {task.files && task.files.length > 0 && (
                        <span className="flex items-center gap-1">
                          <File className="h-3 w-3" />
                          {task.files.length} file{task.files.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button onClick={() => handleOpenReview(task)}>
                    <Eye className="mr-2 h-4 w-4" />
                    Review
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} tasks
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Review Dialog */}
      <Dialog
        open={!!selectedTask}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTask(null);
            setReviewComments('');
            setReviewAction(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review Task</DialogTitle>
            <DialogDescription>
              Review the submitted task and take action
            </DialogDescription>
          </DialogHeader>

          {selectedTask && (
            <div className="space-y-4 py-4">
              {/* Task Details */}
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium mb-1">{selectedTask.title}</h4>
                  {selectedTask.description && (
                    <p className="text-sm text-muted-foreground">
                      {selectedTask.description}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Task Type:</span>
                    <p className="font-medium">
                      {taskTypeLabels[selectedTask.task_type || ''] ||
                        selectedTask.task_type ||
                        '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Project:</span>
                    <p className="font-medium">
                      {selectedTask.project_title || '-'}
                      {selectedTask.project_id && (
                        <Link
                          to={`/projects/${selectedTask.project_id}`}
                          className="ml-2 inline-flex items-center text-primary hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Submitted By:</span>
                    <p className="font-medium">
                      {selectedTask.submitted_by_name || '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Submitted At:</span>
                    <p className="font-medium">
                      {formatDate(selectedTask.submitted_at)}
                    </p>
                  </div>
                  {selectedTask.revision_count > 0 && (
                    <div>
                      <span className="text-muted-foreground">Revision Count:</span>
                      <p className="font-medium text-amber-600">
                        {selectedTask.revision_count}
                      </p>
                    </div>
                  )}
                </div>

                {/* Previous Comments */}
                {selectedTask.reviewer_comments && (
                  <div className="p-3 bg-muted rounded-lg">
                    <span className="text-sm text-muted-foreground block mb-1">
                      Previous Review Comments:
                    </span>
                    <p className="text-sm">{selectedTask.reviewer_comments}</p>
                  </div>
                )}

                {/* Files */}
                {selectedTask.files && selectedTask.files.length > 0 && (
                  <div>
                    <Separator className="my-4" />
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Attached Files
                    </h4>
                    <div className="space-y-2">
                      {selectedTask.files.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-2 border rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <File className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">{file.original_file_name}</span>
                            <span className="text-xs text-muted-foreground">
                              ({formatFileSize(file.file_size)})
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              // Download file
                              window.open(`/api/files/${file.id}`, '_blank');
                            }}
                          >
                            Download
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator className="my-4" />

                {/* Review Comments */}
                <div className="space-y-2">
                  <Label htmlFor="comments">
                    Comments{' '}
                    {(reviewAction === 'reject' || reviewAction === 'revision') && (
                      <span className="text-destructive">*</span>
                    )}
                  </Label>
                  <Textarea
                    id="comments"
                    value={reviewComments}
                    onChange={(e) => setReviewComments(e.target.value)}
                    placeholder="Add your review comments..."
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setSelectedTask(null)}
              className="sm:mr-auto"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setReviewAction('revision');
                if (reviewComments.trim()) {
                  handleSubmitReview();
                } else {
                  toast({
                    variant: 'destructive',
                    title: 'Comments required',
                    description: 'Please add comments explaining what changes are needed',
                  });
                }
              }}
              disabled={isSubmitting}
            >
              {requestRevisionMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Request Revision
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setReviewAction('reject');
                if (reviewComments.trim()) {
                  handleSubmitReview();
                } else {
                  toast({
                    variant: 'destructive',
                    title: 'Comments required',
                    description: 'Please add comments explaining the rejection reason',
                  });
                }
              }}
              disabled={isSubmitting}
            >
              {rejectMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 h-4 w-4" />
              )}
              Reject
            </Button>
            <Button
              onClick={() => {
                setReviewAction('approve');
                handleSubmitReview();
              }}
              disabled={isSubmitting}
            >
              {approveMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Task to Project Dialog */}
      <AssignTaskDialog
        open={showAssignTaskDialog}
        onOpenChange={setShowAssignTaskDialog}
        showProjectSelector={true}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['pendingTasks'] });
        }}
      />
    </div>
  );
}
