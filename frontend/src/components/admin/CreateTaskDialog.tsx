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

// Validation schema
const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  task_type: z.enum(['document_upload', 'form_completion', 'approval_required', 'review', 'general']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  due_date: z.string().optional(),
  assigned_to_id: z.string().optional(),
  is_required: z.boolean(),
});

type CreateTaskFormData = z.infer<typeof createTaskSchema>;

// Task type options
const TASK_TYPES = [
  { value: 'document_upload', label: 'Document Upload' },
  { value: 'form_completion', label: 'Form Completion' },
  { value: 'approval_required', label: 'Approval Required' },
  { value: 'review', label: 'Review' },
  { value: 'general', label: 'General' },
] as const;

// Priority options
const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
] as const;

interface CreateTaskDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateTaskDialog({
  projectId,
  open,
  onOpenChange,
  onSuccess,
}: CreateTaskDialogProps) {
  const { toast } = useToast();

  const form = useForm<CreateTaskFormData>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      title: '',
      description: '',
      task_type: 'general',
      priority: 'medium',
      due_date: '',
      assigned_to_id: '',
      is_required: true,
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: (data: CreateTaskFormData) =>
      tasksApi.create({
        ...data,
        project_id: projectId,
        description: data.description || undefined,
        due_date: data.due_date || undefined,
        assigned_to_id: data.assigned_to_id || undefined,
      }),
    onSuccess: () => {
      toast({ title: 'Task created successfully' });
      form.reset();
      onSuccess();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to create task',
        description: err.response?.data?.error || 'An error occurred',
      });
    },
  });

  const onSubmit = (data: CreateTaskFormData) => {
    createTaskMutation.mutate(data);
  };

  // Reset form when dialog closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
          <DialogDescription>
            Add a new task to this project
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              placeholder="Enter task title"
              {...form.register('title')}
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
              placeholder="Enter task description (optional)"
              rows={3}
              {...form.register('description')}
            />
          </div>

          {/* Task Type */}
          <div className="space-y-2">
            <Label htmlFor="task_type">
              Task Type <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.watch('task_type')}
              onValueChange={(value) =>
                form.setValue('task_type', value as CreateTaskFormData['task_type'])
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select task type" />
              </SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.task_type && (
              <p className="text-sm text-destructive">
                {form.formState.errors.task_type.message}
              </p>
            )}
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label htmlFor="priority">
              Priority <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.watch('priority')}
              onValueChange={(value) =>
                form.setValue('priority', value as CreateTaskFormData['priority'])
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((priority) => (
                  <SelectItem key={priority.value} value={priority.value}>
                    {priority.label}
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
            />
          </div>

          {/* Assign To */}
          <div className="space-y-2">
            <Label htmlFor="assigned_to_id">Assign To</Label>
            <Input
              id="assigned_to_id"
              placeholder="Enter user ID (optional)"
              {...form.register('assigned_to_id')}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to leave unassigned
            </p>
          </div>

          {/* Is Required */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_required"
              checked={form.watch('is_required')}
              onCheckedChange={(checked) =>
                form.setValue('is_required', checked as boolean)
              }
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
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createTaskMutation.isPending}>
              {createTaskMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default CreateTaskDialog;
