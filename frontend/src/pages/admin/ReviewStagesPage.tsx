import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ChevronLeft,
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  Check,
  X,
  GitBranch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { reviewStagesApi, ReviewStage } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

interface StageFormData {
  code: string;
  name: string;
  description: string;
  sequence_order: number;
  default_deadline_days: number;
  requires_all_previous: boolean;
  is_active: boolean;
}

const defaultFormData: StageFormData = {
  code: '',
  name: '',
  description: '',
  sequence_order: 0,
  default_deadline_days: 7,
  requires_all_previous: true,
  is_active: true,
};

export function ReviewStagesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<ReviewStage | null>(null);
  const [formData, setFormData] = useState<StageFormData>(defaultFormData);
  const [deleteStage, setDeleteStage] = useState<ReviewStage | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Fetch stages
  const { data: stagesData, isLoading } = useQuery({
    queryKey: ['reviewStages', showInactive],
    queryFn: async () => {
      const response = await reviewStagesApi.list(!showInactive);
      return response.data.data as ReviewStage[];
    },
  });

  // Create stage mutation
  const createMutation = useMutation({
    mutationFn: (data: StageFormData) => reviewStagesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviewStages'] });
      handleCloseForm();
      toast({
        title: 'Stage created',
        description: 'The review stage has been created successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to create stage',
        variant: 'destructive',
      });
    },
  });

  // Update stage mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<StageFormData> }) =>
      reviewStagesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviewStages'] });
      handleCloseForm();
      toast({
        title: 'Stage updated',
        description: 'The review stage has been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to update stage',
        variant: 'destructive',
      });
    },
  });

  // Delete stage mutation
  const deleteMutation = useMutation({
    mutationFn: (id: number) => reviewStagesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviewStages'] });
      setDeleteStage(null);
      toast({
        title: 'Stage deactivated',
        description: 'The review stage has been deactivated.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to delete stage',
        variant: 'destructive',
      });
    },
  });

  // Reorder stages mutation
  const reorderMutation = useMutation({
    mutationFn: (stageIds: number[]) => reviewStagesApi.reorder(stageIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviewStages'] });
      toast({
        title: 'Order updated',
        description: 'The stage order has been updated.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.response?.data?.error || 'Failed to reorder stages',
        variant: 'destructive',
      });
    },
  });

  const handleOpenCreate = () => {
    const nextOrder = stagesData ? stagesData.length : 0;
    setFormData({ ...defaultFormData, sequence_order: nextOrder });
    setEditingStage(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (stage: ReviewStage) => {
    setFormData({
      code: stage.code,
      name: stage.name,
      description: stage.description || '',
      sequence_order: stage.sequence_order,
      default_deadline_days: stage.default_deadline_days,
      requires_all_previous: stage.requires_all_previous,
      is_active: stage.is_active,
    });
    setEditingStage(stage);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingStage(null);
    setFormData(defaultFormData);
  };

  const handleSubmit = () => {
    if (editingStage) {
      updateMutation.mutate({ id: editingStage.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index || !stagesData) return;

    // Reorder locally for visual feedback
    const newStages = [...stagesData];
    const [draggedItem] = newStages.splice(draggedIndex, 1);
    newStages.splice(index, 0, draggedItem);
    setDraggedIndex(index);

    // Update local cache optimistically
    queryClient.setQueryData(['reviewStages', showInactive], newStages);
  };

  const handleDragEnd = () => {
    if (stagesData) {
      const stageIds = stagesData.map(s => s.id);
      reorderMutation.mutate(stageIds);
    }
    setDraggedIndex(null);
  };

  const stages = stagesData || [];

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
          <h1 className="text-2xl font-bold">Review Stages</h1>
          <p className="text-muted-foreground">
            Configure the multi-stage review workflow for form submissions
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="showInactive"
              checked={showInactive}
              onCheckedChange={(checked) => setShowInactive(checked === true)}
            />
            <Label htmlFor="showInactive" className="text-sm">
              Show inactive
            </Label>
          </div>
          <Button onClick={handleOpenCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Stage
          </Button>
        </div>
      </div>

      {/* Stages List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Review Workflow Stages
          </CardTitle>
          <CardDescription>
            Drag stages to reorder them in the review workflow.{' '}
            {stages.length} stage{stages.length !== 1 ? 's' : ''} configured.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading stages...
            </div>
          ) : stages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No review stages configured. Add a stage to get started.
            </div>
          ) : (
            <div className="space-y-2">
              {stages.map((stage, index) => (
                <div
                  key={stage.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-4 p-4 bg-muted/50 rounded-lg border transition-colors ${
                    draggedIndex === index ? 'opacity-50 border-primary' : ''
                  } ${!stage.is_active ? 'opacity-60' : ''}`}
                >
                  <div className="cursor-grab">
                    <GripVertical className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{stage.name}</span>
                      <Badge variant="outline" className="font-mono text-xs">
                        {stage.code}
                      </Badge>
                      {!stage.is_active && (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </div>
                    {stage.description && (
                      <p className="text-sm text-muted-foreground mt-1 truncate">
                        {stage.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Deadline: {stage.default_deadline_days} days</span>
                      <span>
                        {stage.requires_all_previous
                          ? 'Requires all previous'
                          : 'No dependencies'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenEdit(stage)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteStage(stage)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stage Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={handleCloseForm}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingStage ? 'Edit Review Stage' : 'Add Review Stage'}
            </DialogTitle>
            <DialogDescription>
              {editingStage
                ? 'Modify the stage configuration.'
                : 'Create a new stage in the review workflow.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  placeholder="e.g., dept_review"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sequence_order">Order</Label>
                <Input
                  id="sequence_order"
                  type="number"
                  min={0}
                  value={formData.sequence_order}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      sequence_order: parseInt(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., Department Review"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Optional description of this stage"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="default_deadline_days">
                Default Deadline (days)
              </Label>
              <Input
                id="default_deadline_days"
                type="number"
                min={1}
                value={formData.default_deadline_days}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    default_deadline_days: parseInt(e.target.value) || 7,
                  })
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="requires_all_previous"
                checked={formData.requires_all_previous}
                onCheckedChange={(checked) =>
                  setFormData({
                    ...formData,
                    requires_all_previous: checked === true,
                  })
                }
              />
              <Label htmlFor="requires_all_previous">
                Requires all previous stages to be completed
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked === true })
                }
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseForm}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? 'Saving...'
                : editingStage
                ? 'Save Changes'
                : 'Create Stage'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteStage}
        onOpenChange={(open) => !open && setDeleteStage(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Review Stage</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate{' '}
              <strong>{deleteStage?.name}</strong>? This stage will no longer be
              used for new reviews, but existing reviews at this stage will
              remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteStage && deleteMutation.mutate(deleteStage.id)}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ReviewStagesPage;
