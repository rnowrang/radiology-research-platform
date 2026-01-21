import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useToast } from '@/hooks/useToast';
import { tasksApi } from '@/lib/api';

// =============================================================================
// Types
// =============================================================================

interface TaskSummary {
  id: number;
  title: string;
  description?: string;
  task_type: string;
  status: string;
  priority: string;
  is_required: boolean;
  due_date?: string;
}

interface EditTaskDialogProps {
  task: TaskSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface UpdateTaskData {
  title?: string;
  description?: string;
  priority?: string;
  due_date?: string;
  is_required?: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

// =============================================================================
// Schema
// =============================================================================

const editTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  due_date: z.string().optional(),
  is_required: z.boolean(),
});

type EditTaskFormData = z.infer<typeof editTaskSchema>;

// =============================================================================
// Component
// =============================================================================

export function EditTaskDialog({
  task,
  open,
  onOpenChange,
  onSuccess,
}: EditTaskDialogProps) {
  const { toast } = useToast();

  // Form setup with zod validation
  const form = useForm<EditTaskFormData>({
    resolver: zodResolver(editTaskSchema),
    defaultValues: {
      title: '',
      description: '',
      priority: 'medium',
      due_date: '',
      is_required: false,
    },
  });

  // Pre-populate form with task data when task changes or dialog opens
  useEffect(() => {
    if (task && open) {
      form.reset({
        title: task.title,
        description: task.description || '',
        priority: task.priority as 'low' | 'medium' | 'high' | 'urgent',
        due_date: task.due_date ? task.due_date.split('T')[0] : '',
        is_required: task.is_required,
      });
    }
  }, [task, open, form]);

  // Update task mutation
  const updateTaskMutation = useMutation({
    mutationFn: (data: UpdateTaskData) => tasksApi.update(task!.id, data),
    onSuccess: () => {
      toast({ title: 'Task updated successfully' });
      onSuccess();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to update task',
        description: err.response?.data?.error || 'An error occurred',
      });
    },
  });

  // Handle form submission
  const onSubmit = (data: EditTaskFormData) => {
    const updateData: UpdateTaskData = {
      title: data.title,
      description: data.description || undefined,
      priority: data.priority,
      due_date: data.due_date || undefined,
      is_required: data.is_required,
    };
    updateTaskMutation.mutate(updateData);
  };

  // Don't render if no task is provided
  if (!task) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>Update task details</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              {...form.register('title')}
              placeholder="Enter task title"
              disabled={updateTaskMutation.isPending}
            />
            {form.formState.errors.title && (
              <p className="text-sm text-destructive">
                {form.formState.errors.title.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...form.register('description')}
              placeholder="Enter task description"
              rows={3}
              disabled={updateTaskMutation.isPending}
            />
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select
              value={form.watch('priority')}
              onValueChange={(value) =>
                form.setValue('priority', value as 'low' | 'medium' | 'high' | 'urgent')
              }
              disabled={updateTaskMutation.isPending}
            >
              <SelectTrigger id="priority">
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.priority && (
              <p className="text-sm text-destructive">
                {form.formState.errors.priority.message}
              </p>
            )}
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <Label htmlFor="due_date">Due Date</Label>
            <Input
              id="due_date"
              type="date"
              {...form.register('due_date')}
              disabled={updateTaskMutation.isPending}
            />
          </div>

          {/* Is Required */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_required"
              checked={form.watch('is_required')}
              onCheckedChange={(checked) =>
                form.setValue('is_required', checked as boolean)
              }
              disabled={updateTaskMutation.isPending}
            />
            <Label htmlFor="is_required" className="text-sm font-normal">
              Mark as required task
            </Label>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={updateTaskMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={updateTaskMutation.isPending}>
              {updateTaskMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
