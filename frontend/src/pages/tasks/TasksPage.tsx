import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  Clock,
  Plus,
  Filter,
  AlertCircle,
  Calendar,
  FolderKanban,
  FileText,
  MoreVertical,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/useToast';
import { tasksApi } from '@/lib/api';
import type { Task } from '@/types';

interface TaskItem extends Task {
  project_title?: string;
  form_title?: string;
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any }> = {
  pending: { label: 'Pending', variant: 'secondary', icon: Clock },
  in_progress: { label: 'In Progress', variant: 'default', icon: Clock },
  completed: { label: 'Completed', variant: 'outline', icon: CheckCircle },
  blocked: { label: 'Blocked', variant: 'destructive', icon: AlertCircle },
  cancelled: { label: 'Cancelled', variant: 'outline', icon: AlertCircle },
};

const priorityConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  low: { label: 'Low', variant: 'outline' },
  medium: { label: 'Medium', variant: 'secondary' },
  high: { label: 'High', variant: 'default' },
  urgent: { label: 'Urgent', variant: 'destructive' },
};

const taskTypes = [
  { value: 'document_upload', label: 'Document Upload' },
  { value: 'form_completion', label: 'Form Completion' },
  { value: 'review', label: 'Review' },
  { value: 'approval', label: 'Approval' },
  { value: 'general', label: 'General' },
];

interface TaskFormData {
  title: string;
  description: string;
  task_type: string;
  priority: string;
  due_date: string;
}

export function TasksPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTask, setNewTask] = useState<TaskFormData>({
    title: '',
    description: '',
    task_type: 'general',
    priority: 'medium',
    due_date: '',
  });

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['tasks', statusFilter, priorityFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter !== 'all' && statusFilter !== 'active') {
        params.status = statusFilter;
      }
      if (priorityFilter !== 'all') {
        params.priority = priorityFilter;
      }
      const response = await tasksApi.list();
      return response.data.data as TaskItem[];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: TaskFormData) => tasksApi.create({
      ...data,
      due_date: data.due_date || undefined,
    }),
    onSuccess: () => {
      toast({ title: 'Task created' });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setShowCreateDialog(false);
      setNewTask({
        title: '',
        description: '',
        task_type: 'general',
        priority: 'medium',
        due_date: '',
      });
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to create task' });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (taskId: number) => tasksApi.complete(taskId),
    onSuccess: () => {
      toast({ title: 'Task completed' });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to complete task' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ taskId, data }: { taskId: number; data: any }) =>
      tasksApi.update(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const tasks = tasksData || [];

  // Filter tasks for "active" status (pending + in_progress)
  const filteredTasks = tasks.filter((task) => {
    if (statusFilter === 'active') {
      return task.status === 'pending' || task.status === 'in_progress';
    }
    if (statusFilter !== 'all') {
      return task.status === statusFilter;
    }
    return true;
  }).filter((task) => {
    if (priorityFilter !== 'all') {
      return task.priority === priorityFilter;
    }
    return true;
  });

  // Stats
  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const overdueCount = tasks.filter((t) => {
    if (t.status === 'completed' || (t.status as string) === 'cancelled') return false;
    if (!t.dueDate) return false;
    return new Date(t.dueDate) < new Date();
  }).length;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const isOverdue = (task: TaskItem) => {
    if (task.status === 'completed' || (task.status as string) === 'cancelled') return false;
    if (!task.dueDate) return false;
    return new Date(task.dueDate) < new Date();
  };

  const handleCreateTask = () => {
    if (!newTask.title.trim()) {
      toast({ variant: 'destructive', title: 'Task title is required' });
      return;
    }
    createMutation.mutate(newTask);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">
            Manage your tasks and to-dos
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Task
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inProgressCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{overdueCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tasks</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tasks List */}
      <Card>
        <CardHeader>
          <CardTitle>Tasks</CardTitle>
          <CardDescription>
            {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
              <h3 className="text-lg font-medium">All caught up!</h3>
              <p className="text-muted-foreground mt-1">
                {statusFilter === 'active'
                  ? 'No active tasks'
                  : 'No tasks match your filters'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map((task) => {
                const config = statusConfig[task.status] || statusConfig.pending;
                const pConfig = priorityConfig[task.priority] || priorityConfig.medium;

                return (
                  <div
                    key={task.id}
                    className={`flex items-center gap-4 p-4 rounded-lg border ${
                      task.status === 'completed' ? 'opacity-60' : ''
                    } ${isOverdue(task) ? 'border-destructive bg-destructive/5' : ''}`}
                  >
                    <Checkbox
                      checked={task.status === 'completed'}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          completeMutation.mutate(task.id);
                        } else {
                          updateMutation.mutate({
                            taskId: task.id,
                            data: { status: 'pending' },
                          });
                        }
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-medium ${
                            task.status === 'completed' ? 'line-through' : ''
                          }`}
                        >
                          {task.title}
                        </span>
                        <Badge variant={pConfig.variant} className="text-xs">
                          {pConfig.label}
                        </Badge>
                      </div>
                      {task.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        {task.project_title && (
                          <span className="flex items-center gap-1">
                            <FolderKanban className="h-3 w-3" />
                            {task.project_title}
                          </span>
                        )}
                        {task.form_title && (
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {task.form_title}
                          </span>
                        )}
                        {task.dueDate && (
                          <span
                            className={`flex items-center gap-1 ${
                              isOverdue(task) ? 'text-destructive' : ''
                            }`}
                          >
                            <Calendar className="h-3 w-3" />
                            {isOverdue(task) ? 'Overdue: ' : 'Due: '}
                            {formatDate(task.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant={config.variant}>{config.label}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {task.status === 'pending' && (
                          <DropdownMenuItem
                            onClick={() =>
                              updateMutation.mutate({
                                taskId: task.id,
                                data: { status: 'in_progress' },
                              })
                            }
                          >
                            Start Task
                          </DropdownMenuItem>
                        )}
                        {task.status !== 'completed' && (
                          <DropdownMenuItem
                            onClick={() => completeMutation.mutate(task.id)}
                          >
                            Mark Complete
                          </DropdownMenuItem>
                        )}
                        {task.projectId && (
                          <DropdownMenuItem
                            onClick={() => navigate(`/projects/${task.projectId}`)}
                          >
                            View Project
                          </DropdownMenuItem>
                        )}
                        {task.formInstanceId && (
                          <DropdownMenuItem
                            onClick={() => navigate(`/forms/${task.formInstanceId}`)}
                          >
                            View Form
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Task Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
            <DialogDescription>Add a new task to your list</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={newTask.title}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Task title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
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
                <Label htmlFor="task_type">Type</Label>
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
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={newTask.priority}
                  onValueChange={(value) =>
                    setNewTask((prev) => ({ ...prev, priority: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="due_date">Due Date</Label>
              <Input
                id="due_date"
                type="date"
                value={newTask.due_date}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, due_date: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateTask} disabled={createMutation.isPending}>
              {createMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
