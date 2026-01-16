import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/useToast';
import { api, taskDefinitionsApi, usersApi, projectsApi } from '@/lib/api';

// Types
interface TaskDefinition {
  id: number;
  name: string;
  description?: string;
  task_type: string;
  default_required: boolean;
  is_active: boolean;
}

interface UserOption {
  id: string;
  email: string;
  full_name: string;
}

interface ProjectOption {
  id: string;
  title: string;
}

interface AssignTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  showProjectSelector?: boolean;
  onSuccess?: () => void;
}

// Task types for custom tasks
const TASK_TYPES = [
  { value: 'form_completion', label: 'Form Completion' },
  { value: 'document_upload', label: 'Document Upload' },
  { value: 'approval_required', label: 'Approval Required' },
  { value: 'external_submission', label: 'External Submission' },
  { value: 'checklist', label: 'Checklist' },
];

// Priority options
const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export function AssignTaskDialog({
  open,
  onOpenChange,
  projectId,
  showProjectSelector = false,
  onSuccess,
}: AssignTaskDialogProps) {
  const { toast } = useToast();

  // Tab state
  const [activeTab, setActiveTab] = useState<'definition' | 'custom'>('definition');

  // Form state - From Definition mode
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<string>('');

  // Form state - Custom Task mode
  const [customTitle, setCustomTitle] = useState('');
  const [customDescription, setCustomDescription] = useState('');
  const [customTaskType, setCustomTaskType] = useState('form_completion');

  // Common form state
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');
  const [isRequired, setIsRequired] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId || '');

  // Update selectedProjectId when projectId prop changes
  useEffect(() => {
    if (projectId) {
      setSelectedProjectId(projectId);
    }
  }, [projectId]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setActiveTab('definition');
      setSelectedDefinitionId('');
      setCustomTitle('');
      setCustomDescription('');
      setCustomTaskType('form_completion');
      setSelectedAssigneeId('');
      setDueDate('');
      setPriority('medium');
      setIsRequired(false);
      if (!projectId) {
        setSelectedProjectId('');
      }
    }
  }, [open, projectId]);

  // Fetch task definitions
  const { data: definitionsData, isLoading: definitionsLoading } = useQuery({
    queryKey: ['taskDefinitions'],
    queryFn: async () => {
      const response = await taskDefinitionsApi.getAll();
      return response.data.data as TaskDefinition[];
    },
    enabled: open,
  });

  // Fetch users for assignee dropdown
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['adminUsers'],
    queryFn: async () => {
      const response = await usersApi.list({ is_active: true, limit: 100 });
      return response.data.data as UserOption[];
    },
    enabled: open,
  });

  // Fetch projects if showProjectSelector is true
  const { data: projectsData, isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const response = await projectsApi.list();
      return response.data.data as ProjectOption[];
    },
    enabled: open && showProjectSelector,
  });

  // Get the selected definition details
  const selectedDefinition = definitionsData?.find(
    (d) => d.id.toString() === selectedDefinitionId
  );

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
      const targetProjectId = selectedProjectId || projectId;
      if (!targetProjectId) {
        throw new Error('Project ID is required');
      }
      return api.post(`/projects/${targetProjectId}/tasks`, data);
    },
    onSuccess: () => {
      toast({ title: 'Task assigned successfully' });
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || error.message || 'Failed to assign task',
      });
    },
  });

  const handleSubmit = () => {
    const targetProjectId = selectedProjectId || projectId;

    if (!targetProjectId) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please select a project',
      });
      return;
    }

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
        is_required: isRequired,
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
  const users = usersData || [];
  const projects = projectsData || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Task</DialogTitle>
          <DialogDescription>
            Assign a task from a definition or create a custom task
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'definition' | 'custom')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="definition">From Definition</TabsTrigger>
            <TabsTrigger value="custom">Custom Task</TabsTrigger>
          </TabsList>

          <TabsContent value="definition" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="definition">Task Definition</Label>
              {definitionsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : definitions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  No task definitions available. Create one in the admin settings.
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
                <p className="text-xs text-muted-foreground mt-2">
                  Type: {TASK_TYPES.find((t) => t.value === selectedDefinition.task_type)?.label || selectedDefinition.task_type}
                </p>
              </div>
            )}
          </TabsContent>

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
                placeholder="Enter task description"
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
        </Tabs>

        {/* Common fields */}
        <div className="space-y-4 border-t pt-4 mt-4">
          {showProjectSelector && (
            <div className="space-y-2">
              <Label htmlFor="project">
                Project <span className="text-destructive">*</span>
              </Label>
              {projectsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="assignee">Assignee</Label>
            {usersLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Select value={selectedAssigneeId || 'unassigned'} onValueChange={(val) => setSelectedAssigneeId(val === 'unassigned' ? '' : val)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an assignee (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.full_name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dueDate">Due Date</Label>
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
            Assign Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
