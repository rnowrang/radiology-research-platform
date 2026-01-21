import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, ListChecks, PenLine } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/useToast';
import { api, taskDefinitionsApi, projectsApi } from '@/lib/api';

// Types
interface TaskDefinition {
  id: number;
  name: string;
  description?: string;
  task_type: string;
  default_required: boolean;
  is_active: boolean;
}

interface Collaborator {
  id: string;
  user_id: string;
  role: string;
  user_name?: string;
  user_email?: string;
}

interface AddTaskToProjectDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskAdded: () => void;
  collaborators?: Collaborator[];
}

// Task types for custom tasks
const TASK_TYPES = [
  { value: 'form_completion', label: 'Form Completion' },
  { value: 'document_upload', label: 'Document Upload' },
  { value: 'approval_required', label: 'Approval Required' },
  { value: 'external_submission', label: 'External Submission' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'general', label: 'General' },
];

// Priority options
const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export function AddTaskToProjectDialog({
  projectId,
  open,
  onOpenChange,
  onTaskAdded,
  collaborators = [],
}: AddTaskToProjectDialogProps) {
  const { toast } = useToast();

  // Tab state - 'definition' to select from existing definitions, 'custom' for ad-hoc task
  const [activeTab, setActiveTab] = useState<'definition' | 'custom'>('custom');

  // Form state - From Definition mode
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<string>('');

  // Form state - Custom Task mode
  const [customTitle, setCustomTitle] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customTaskType, setCustomTaskType] = useState('general');

  // Common form state
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');
  const [isRequired, setIsRequired] = useState(false);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setActiveTab('custom');
      setSelectedDefinitionId('');
      setCustomTitle('');
      setCustomDescription('');
      setCustomTaskType('general');
      setSelectedAssigneeId('');
      setDueDate('');
      setPriority('medium');
      setIsRequired(false);
    }
  }, [open]);

  // Fetch task definitions (for the 'From Definition' tab)
  const { data: definitionsData, isLoading: definitionsLoading } = useQuery({
    queryKey: ['taskDefinitions'],
    queryFn: async () => {
      const response = await taskDefinitionsApi.getAll();
      return response.data.data as TaskDefinition[];
    },
    enabled: open,
  });

  // Fetch project collaborators if not provided
  const { data: projectCollaborators } = useQuery({
    queryKey: ['projectCollaborators', projectId],
    queryFn: async () => {
      const response = await projectsApi.getCollaborators(projectId);
      return response.data.data as Collaborator[];
    },
    enabled: open && collaborators.length === 0,
  });

  // Get the selected definition details
  const selectedDefinition = definitionsData?.find(
    (d) => d.id.toString() === selectedDefinitionId
  );

  // Use provided collaborators or fetched ones
  const assigneeOptions = collaborators.length > 0 ? collaborators : (projectCollaborators || []);

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (data: {
      title: string;
      description?: string;
      task_type: string;
      assigned_to_id?: string;
      due_date?: string;
      priority: string;
      is_required: boolean;
      task_definition_id?: number;
    }) => {
      return api.post(`/projects/${projectId}/tasks`, data);
    },
    onSuccess: () => {
      toast({ title: 'Task added successfully' });
      onOpenChange(false);
      onTaskAdded();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || error.message || 'Failed to add task',
      });
    },
  });

  const handleSubmit = () => {
    if (activeTab === 'definition') {
      if (!selectedDefinitionId || !selectedDefinition) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Please select a task definition',
        });
        return;
      }

      createTaskMutation.mutate({
        title: selectedDefinition.name,
        description: selectedDefinition.description,
        task_type: selectedDefinition.task_type,
        assigned_to_id: selectedAssigneeId || undefined,
        due_date: dueDate || undefined,
        priority,
        is_required: isRequired || selectedDefinition.default_required,
        task_definition_id: selectedDefinition.id,
      });
    } else {
      if (!customTitle.trim()) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Task title is required',
        });
        return;
      }

      createTaskMutation.mutate({
        title: customTitle.trim(),
        description: customDescription.trim() || undefined,
        task_type: customTaskType,
        assigned_to_id: selectedAssigneeId || undefined,
        due_date: dueDate || undefined,
        priority,
        is_required: isRequired,
      });
    }
  };

  const definitions = definitionsData?.filter((d) => d.is_active) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Task to Project</DialogTitle>
          <DialogDescription>
            Add a new task from a predefined definition or create a custom ad-hoc task
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'definition' | 'custom')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="custom" className="gap-2">
              <PenLine className="h-4 w-4" />
              Custom Task
            </TabsTrigger>
            <TabsTrigger value="definition" className="gap-2">
              <ListChecks className="h-4 w-4" />
              From Definition
            </TabsTrigger>
          </TabsList>

          {/* Custom Task Tab */}
          <TabsContent value="custom" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="Enter task title"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={customDescription}
                onChange={(e) => setCustomDescription(e.target.value)}
                placeholder="Enter task description (optional)"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="taskType">Task Type</Label>
              <Select value={customTaskType} onValueChange={setCustomTaskType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          {/* From Definition Tab */}
          <TabsContent value="definition" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="definition">Task Definition</Label>
              {definitionsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : definitions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No task definitions available. Create one in the admin settings or use a custom task.
                </p>
              ) : (
                <Select
                  value={selectedDefinitionId}
                  onValueChange={setSelectedDefinitionId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a task definition" />
                  </SelectTrigger>
                  <SelectContent>
                    {definitions.map((def) => (
                      <SelectItem key={def.id} value={def.id.toString()}>
                        {def.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedDefinition && (
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="font-medium mb-1">{selectedDefinition.name}</p>
                {selectedDefinition.description && (
                  <p className="text-muted-foreground">{selectedDefinition.description}</p>
                )}
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                  <span>
                    Type: {TASK_TYPES.find((t) => t.value === selectedDefinition.task_type)?.label || selectedDefinition.task_type}
                  </span>
                  {selectedDefinition.default_required && (
                    <span className="text-destructive">Required by default</span>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Common fields */}
        <div className="space-y-4 border-t pt-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="assignee">Assign To (optional)</Label>
            <Select
              value={selectedAssigneeId || 'unassigned'}
              onValueChange={(val) => setSelectedAssigneeId(val === 'unassigned' ? '' : val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {assigneeOptions.map((collab) => (
                  <SelectItem key={collab.user_id} value={collab.user_id}>
                    {collab.user_name || collab.user_email || collab.user_id.slice(0, 8) + '...'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date (optional)</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="required"
              checked={isRequired}
              onCheckedChange={(checked) => setIsRequired(checked as boolean)}
            />
            <Label htmlFor="required" className="text-sm font-normal">
              Mark as required task
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createTaskMutation.isPending}>
            {createTaskMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Add Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddTaskToProjectDialog;
