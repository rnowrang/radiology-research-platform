import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  Plus,
  Edit,
  Trash2,
  Settings2,
  Loader2,
  CheckCircle,
  ListChecks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/useToast';
import { api } from '@/lib/api';

// Types
interface TaskDefinition {
  id: number;
  name: string;
  description?: string;
  task_type: string;
  auto_submit: boolean;
  default_required: boolean;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

interface ProjectTypeMapping {
  id: number;
  project_type: string;
  task_definition_id: number;
  task_definition?: TaskDefinition;
  is_required: boolean;
  display_order: number;
  created_at: string;
}

interface TaskDefinitionFormData {
  name: string;
  description: string;
  task_type: string;
  auto_submit: boolean;
  default_required: boolean;
  display_order: number;
}

// API functions
const taskDefinitionsApi = {
  list: () => api.get('/admin/task-definitions'),
  create: (data: TaskDefinitionFormData) => api.post('/admin/task-definitions', data),
  update: (id: number, data: Partial<TaskDefinitionFormData>) =>
    api.put(`/admin/task-definitions/${id}`, data),
  delete: (id: number) => api.delete(`/admin/task-definitions/${id}`),
};

const projectTypeMappingsApi = {
  list: () => api.get('/admin/project-type-mappings'),
  listByType: (projectType: string) =>
    api.get(`/admin/project-type-mappings/${projectType}`),
  create: (data: { project_type: string; task_definition_id: number; is_required?: boolean }) =>
    api.post('/admin/project-type-mappings', data),
  update: (id: number, data: { is_required?: boolean }) =>
    api.put(`/admin/project-type-mappings/${id}`, data),
  delete: (id: number) => api.delete(`/admin/project-type-mappings/${id}`),
};

// Task types
const taskTypes = [
  { value: 'document_upload', label: 'Document Upload' },
  { value: 'form_completion', label: 'Form Completion' },
  { value: 'approval_required', label: 'Approval Required' },
];

// Project types
const projectTypes = [
  { value: 'retrospective', label: 'Retrospective Study' },
  { value: 'prospective', label: 'Prospective Study' },
  { value: 'clinical_trial', label: 'Clinical Trial' },
  { value: 'observational', label: 'Observational Study' },
  { value: 'longitudinal', label: 'Longitudinal Study' },
];

const taskTypeLabels: Record<string, string> = {
  document_upload: 'Document Upload',
  form_completion: 'Form Completion',
  approval_required: 'Approval Required',
};

export function WorkflowConfigPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('definitions');

  // Task Definition Dialog State
  const [showDefinitionDialog, setShowDefinitionDialog] = useState(false);
  const [editingDefinition, setEditingDefinition] = useState<TaskDefinition | null>(null);
  const [definitionForm, setDefinitionForm] = useState<TaskDefinitionFormData>({
    name: '',
    description: '',
    task_type: 'document_upload',
    auto_submit: false,
    default_required: true,
    display_order: 0,
  });

  // Delete Confirmation State
  const [deleteDefinition, setDeleteDefinition] = useState<TaskDefinition | null>(null);

  // Add Task Mapping Dialog State
  const [showAddMappingDialog, setShowAddMappingDialog] = useState(false);
  const [selectedProjectType, setSelectedProjectType] = useState<string>('');
  const [selectedTaskDefinitionId, setSelectedTaskDefinitionId] = useState<string>('');
  const [mappingIsRequired, setMappingIsRequired] = useState(true);

  // Fetch Task Definitions
  const { data: definitionsData, isLoading: definitionsLoading } = useQuery({
    queryKey: ['taskDefinitions'],
    queryFn: async () => {
      const response = await taskDefinitionsApi.list();
      return response.data.data as TaskDefinition[];
    },
  });

  // Fetch Project Type Mappings
  const { data: mappingsData, isLoading: mappingsLoading } = useQuery({
    queryKey: ['projectTypeMappings'],
    queryFn: async () => {
      const response = await projectTypeMappingsApi.list();
      return response.data.data as ProjectTypeMapping[];
    },
  });

  const definitions = definitionsData || [];
  const mappings = mappingsData || [];

  // Create Definition Mutation
  const createDefinitionMutation = useMutation({
    mutationFn: (data: TaskDefinitionFormData) => taskDefinitionsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskDefinitions'] });
      setShowDefinitionDialog(false);
      resetDefinitionForm();
      toast({ title: 'Task definition created successfully' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to create task definition',
      });
    },
  });

  // Update Definition Mutation
  const updateDefinitionMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TaskDefinitionFormData> }) =>
      taskDefinitionsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskDefinitions'] });
      setShowDefinitionDialog(false);
      setEditingDefinition(null);
      resetDefinitionForm();
      toast({ title: 'Task definition updated successfully' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update task definition',
      });
    },
  });

  // Delete Definition Mutation
  const deleteDefinitionMutation = useMutation({
    mutationFn: (id: number) => taskDefinitionsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskDefinitions'] });
      queryClient.invalidateQueries({ queryKey: ['projectTypeMappings'] });
      setDeleteDefinition(null);
      toast({ title: 'Task definition deleted successfully' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to delete task definition',
      });
    },
  });

  // Toggle Active Status Mutation
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      taskDefinitionsApi.update(id, { is_active } as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taskDefinitions'] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update status',
      });
    },
  });

  // Create Mapping Mutation
  const createMappingMutation = useMutation({
    mutationFn: (data: { project_type: string; task_definition_id: number; is_required?: boolean }) =>
      projectTypeMappingsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTypeMappings'] });
      setShowAddMappingDialog(false);
      setSelectedProjectType('');
      setSelectedTaskDefinitionId('');
      setMappingIsRequired(true);
      toast({ title: 'Task mapping added successfully' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to add task mapping',
      });
    },
  });

  // Update Mapping Mutation
  const updateMappingMutation = useMutation({
    mutationFn: ({ id, is_required }: { id: number; is_required: boolean }) =>
      projectTypeMappingsApi.update(id, { is_required }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTypeMappings'] });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update mapping',
      });
    },
  });

  // Delete Mapping Mutation
  const deleteMappingMutation = useMutation({
    mutationFn: (id: number) => projectTypeMappingsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectTypeMappings'] });
      toast({ title: 'Task mapping removed successfully' });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.response?.data?.error || 'Failed to remove mapping',
      });
    },
  });

  // Helper functions
  const resetDefinitionForm = () => {
    setDefinitionForm({
      name: '',
      description: '',
      task_type: 'document_upload',
      auto_submit: false,
      default_required: true,
      display_order: 0,
    });
  };

  const handleOpenCreateDialog = () => {
    setEditingDefinition(null);
    resetDefinitionForm();
    // Set default display order to one more than max
    const maxOrder = definitions.reduce(
      (max, def) => Math.max(max, def.display_order),
      0
    );
    setDefinitionForm((prev) => ({ ...prev, display_order: maxOrder + 1 }));
    setShowDefinitionDialog(true);
  };

  const handleOpenEditDialog = (definition: TaskDefinition) => {
    setEditingDefinition(definition);
    setDefinitionForm({
      name: definition.name,
      description: definition.description || '',
      task_type: definition.task_type,
      auto_submit: definition.auto_submit,
      default_required: definition.default_required,
      display_order: definition.display_order,
    });
    setShowDefinitionDialog(true);
  };

  const handleSubmitDefinition = () => {
    if (!definitionForm.name.trim()) {
      toast({ variant: 'destructive', title: 'Name is required' });
      return;
    }

    if (editingDefinition) {
      updateDefinitionMutation.mutate({
        id: editingDefinition.id,
        data: definitionForm,
      });
    } else {
      createDefinitionMutation.mutate(definitionForm);
    }
  };

  const handleOpenAddMappingDialog = (projectType: string) => {
    setSelectedProjectType(projectType);
    setSelectedTaskDefinitionId('');
    setMappingIsRequired(true);
    setShowAddMappingDialog(true);
  };

  const handleAddMapping = () => {
    if (!selectedProjectType || !selectedTaskDefinitionId) {
      toast({ variant: 'destructive', title: 'Please select a task definition' });
      return;
    }

    createMappingMutation.mutate({
      project_type: selectedProjectType,
      task_definition_id: parseInt(selectedTaskDefinitionId, 10),
      is_required: mappingIsRequired,
    });
  };

  // Get mappings for a project type
  const getMappingsForType = (projectType: string) => {
    return mappings.filter((m) => m.project_type === projectType);
  };

  // Get available definitions for a project type (not already mapped)
  const getAvailableDefinitions = (projectType: string) => {
    const mappedIds = getMappingsForType(projectType).map(
      (m) => m.task_definition_id
    );
    return definitions.filter(
      (d) => d.is_active && !mappedIds.includes(d.id)
    );
  };

  // Get definition by ID
  const getDefinitionById = (id: number) => {
    return definitions.find((d) => d.id === id);
  };

  const isSubmitting =
    createDefinitionMutation.isPending ||
    updateDefinitionMutation.isPending;

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
          <h1 className="text-2xl font-bold">Workflow Configuration</h1>
          <p className="text-muted-foreground">
            Manage task definitions and project type mappings
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="definitions">
            <ListChecks className="mr-2 h-4 w-4" />
            Task Definitions
          </TabsTrigger>
          <TabsTrigger value="mappings">
            <Settings2 className="mr-2 h-4 w-4" />
            Project Type Mappings
          </TabsTrigger>
        </TabsList>

        {/* Task Definitions Tab */}
        <TabsContent value="definitions" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Task Definitions</CardTitle>
                <CardDescription>
                  Define task templates that can be assigned to projects
                </CardDescription>
              </div>
              <Button onClick={handleOpenCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                Create Definition
              </Button>
            </CardHeader>
            <CardContent>
              {definitionsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : definitions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ListChecks className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No task definitions</h3>
                  <p className="text-muted-foreground mt-1">
                    Create task definitions to use in your workflow
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Task Type</TableHead>
                      <TableHead className="text-center">Display Order</TableHead>
                      <TableHead className="text-center">Active</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {definitions
                      .sort((a, b) => a.display_order - b.display_order)
                      .map((definition) => (
                        <TableRow key={definition.id}>
                          <TableCell className="font-medium">
                            {definition.name}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {definition.description || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {taskTypeLabels[definition.task_type] || definition.task_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {definition.display_order}
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={definition.is_active}
                              onCheckedChange={(checked: boolean) =>
                                toggleActiveMutation.mutate({
                                  id: definition.id,
                                  is_active: checked,
                                })
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenEditDialog(definition)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteDefinition(definition)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Project Type Mappings Tab */}
        <TabsContent value="mappings" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Project Type Mappings</CardTitle>
              <CardDescription>
                Configure which tasks are automatically created for each project type
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mappingsLoading || definitionsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Accordion type="multiple" className="w-full">
                  {projectTypes.map((projectType) => {
                    const typeMappings = getMappingsForType(projectType.value);
                    const availableDefinitions = getAvailableDefinitions(projectType.value);

                    return (
                      <AccordionItem key={projectType.value} value={projectType.value}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-3">
                            <span className="font-medium">{projectType.label}</span>
                            <Badge variant="secondary">
                              {typeMappings.length} task{typeMappings.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-4 pt-2">
                            {typeMappings.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                No tasks mapped to this project type
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {typeMappings
                                  .sort((a, b) => a.display_order - b.display_order)
                                  .map((mapping) => {
                                    const definition = getDefinitionById(
                                      mapping.task_definition_id
                                    );
                                    return (
                                      <div
                                        key={mapping.id}
                                        className="flex items-center justify-between p-3 border rounded-lg bg-muted/50"
                                      >
                                        <div className="flex items-center gap-3">
                                          <CheckCircle className="h-4 w-4 text-green-500" />
                                          <div>
                                            <p className="font-medium">
                                              {definition?.name || 'Unknown Task'}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                              {taskTypeLabels[definition?.task_type || ''] ||
                                                definition?.task_type}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                          <div className="flex items-center gap-2">
                                            <Label
                                              htmlFor={`required-${mapping.id}`}
                                              className="text-sm"
                                            >
                                              Required
                                            </Label>
                                            <Switch
                                              id={`required-${mapping.id}`}
                                              checked={mapping.is_required}
                                              onCheckedChange={(checked: boolean) =>
                                                updateMappingMutation.mutate({
                                                  id: mapping.id,
                                                  is_required: checked,
                                                })
                                              }
                                            />
                                          </div>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() =>
                                              deleteMappingMutation.mutate(mapping.id)
                                            }
                                          >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                          </Button>
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            )}

                            <Button
                              variant="outline"
                              onClick={() => handleOpenAddMappingDialog(projectType.value)}
                              disabled={availableDefinitions.length === 0}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Add Task
                            </Button>
                            {availableDefinitions.length === 0 &&
                              definitions.filter((d) => d.is_active).length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  All active task definitions are already mapped
                                </p>
                              )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create/Edit Definition Dialog */}
      <Dialog open={showDefinitionDialog} onOpenChange={setShowDefinitionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingDefinition ? 'Edit Task Definition' : 'Create Task Definition'}
            </DialogTitle>
            <DialogDescription>
              {editingDefinition
                ? 'Update the task definition details'
                : 'Define a new task template for your workflow'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={definitionForm.name}
                onChange={(e) =>
                  setDefinitionForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g., Protocol Document Upload"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={definitionForm.description}
                onChange={(e) =>
                  setDefinitionForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="Describe what this task involves..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task_type">Task Type</Label>
              <Select
                value={definitionForm.task_type}
                onValueChange={(value) =>
                  setDefinitionForm((prev) => ({ ...prev, task_type: value }))
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
              <Label htmlFor="display_order">Display Order</Label>
              <Input
                id="display_order"
                type="number"
                value={definitionForm.display_order}
                onChange={(e) =>
                  setDefinitionForm((prev) => ({
                    ...prev,
                    display_order: parseInt(e.target.value, 10) || 0,
                  }))
                }
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="auto_submit"
                checked={definitionForm.auto_submit}
                onCheckedChange={(checked: boolean | 'indeterminate') =>
                  setDefinitionForm((prev) => ({
                    ...prev,
                    auto_submit: checked === true,
                  }))
                }
              />
              <Label htmlFor="auto_submit" className="text-sm font-normal">
                Auto-submit when completed
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="default_required"
                checked={definitionForm.default_required}
                onCheckedChange={(checked: boolean | 'indeterminate') =>
                  setDefinitionForm((prev) => ({
                    ...prev,
                    default_required: checked === true,
                  }))
                }
              />
              <Label htmlFor="default_required" className="text-sm font-normal">
                Required by default
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDefinitionDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmitDefinition} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingDefinition ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteDefinition}
        onOpenChange={(open) => !open && setDeleteDefinition(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task Definition</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <strong>{deleteDefinition?.name}</strong>? This will also remove
              all project type mappings for this task. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteDefinition && deleteDefinitionMutation.mutate(deleteDefinition.id)
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Task Mapping Dialog */}
      <Dialog open={showAddMappingDialog} onOpenChange={setShowAddMappingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Task to Project Type</DialogTitle>
            <DialogDescription>
              Select a task definition to add to{' '}
              {projectTypes.find((t) => t.value === selectedProjectType)?.label ||
                selectedProjectType}{' '}
              projects
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="task_definition">Task Definition</Label>
              <Select
                value={selectedTaskDefinitionId}
                onValueChange={setSelectedTaskDefinitionId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a task definition" />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableDefinitions(selectedProjectType).map((def) => (
                    <SelectItem key={def.id} value={def.id.toString()}>
                      {def.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="mapping_required"
                checked={mappingIsRequired}
                onCheckedChange={(checked: boolean | 'indeterminate') => setMappingIsRequired(checked === true)}
              />
              <Label htmlFor="mapping_required" className="text-sm font-normal">
                Mark as required task
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddMappingDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddMapping}
              disabled={createMappingMutation.isPending}
            >
              {createMappingMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Add Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
