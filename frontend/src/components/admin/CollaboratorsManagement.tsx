import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Trash2, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { projectsApi } from '@/lib/api';
import { AddCollaboratorDialog } from './AddCollaboratorDialog';

// =============================================================================
// Types
// =============================================================================

export type CollaboratorRole = 'co_investigator' | 'research_assistant' | 'coordinator' | 'viewer';

export interface Collaborator {
  id: string;
  user_id: string;
  project_id: string;
  role: CollaboratorRole;
  user: {
    id: string;
    full_name: string;
    email: string;
  };
  added_at: string;
}

interface CollaboratorsManagementProps {
  projectId: string;
}

// =============================================================================
// Constants
// =============================================================================

const ROLE_OPTIONS: { value: CollaboratorRole; label: string }[] = [
  { value: 'co_investigator', label: 'Co-Investigator' },
  { value: 'research_assistant', label: 'Research Assistant' },
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'viewer', label: 'Viewer' },
];

const getRoleLabel = (role: CollaboratorRole): string => {
  const roleOption = ROLE_OPTIONS.find((r) => r.value === role);
  return roleOption?.label || role;
};

const getInitials = (name: string): string => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

// =============================================================================
// Component
// =============================================================================

export function CollaboratorsManagement({ projectId }: CollaboratorsManagementProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [collaboratorToDelete, setCollaboratorToDelete] = useState<Collaborator | null>(null);

  // Fetch collaborators
  const {
    data: collaboratorsData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['projectCollaborators', projectId],
    queryFn: async () => {
      const response = await projectsApi.getCollaborators(projectId);
      return response.data.data as Collaborator[];
    },
    enabled: !!projectId,
  });

  const collaborators = collaboratorsData || [];
  const existingCollaboratorIds = collaborators.map((c) => c.user_id);

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      projectsApi.updateCollaboratorRole(projectId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectCollaborators', projectId] });
      toast({ title: 'Role updated successfully' });
    },
    onError: (err: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.response?.data?.error || 'Failed to update role',
      });
    },
  });

  // Remove collaborator mutation
  const removeCollaboratorMutation = useMutation({
    mutationFn: (userId: string) => projectsApi.removeCollaborator(projectId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projectCollaborators', projectId] });
      setDeleteDialogOpen(false);
      setCollaboratorToDelete(null);
      toast({ title: 'Collaborator removed successfully' });
    },
    onError: (err: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.response?.data?.error || 'Failed to remove collaborator',
      });
    },
  });

  const handleRoleChange = (userId: string, newRole: string) => {
    updateRoleMutation.mutate({ userId, role: newRole });
  };

  const handleDeleteClick = (collaborator: Collaborator) => {
    setCollaboratorToDelete(collaborator);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (collaboratorToDelete) {
      removeCollaboratorMutation.mutate(collaboratorToDelete.user_id);
    }
  };

  const handleAddSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['projectCollaborators', projectId] });
  };

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (isError) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground">Failed to load collaborators</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Collaborators</CardTitle>
              <CardDescription>
                Manage team members who have access to this project
              </CardDescription>
            </div>
            <Button onClick={() => setAddDialogOpen(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Collaborator
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {collaborators.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No Collaborators</h3>
              <p className="text-muted-foreground mt-1 mb-4">
                This project doesn't have any collaborators yet
              </p>
              <Button onClick={() => setAddDialogOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add Collaborator
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {collaborators.map((collaborator) => (
                <div
                  key={collaborator.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>
                        {getInitials(collaborator.user.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{collaborator.user.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {collaborator.user.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Select
                      value={collaborator.role}
                      onValueChange={(value) =>
                        handleRoleChange(collaborator.user_id, value)
                      }
                      disabled={updateRoleMutation.isPending}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select role">
                          {getRoleLabel(collaborator.role)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((role) => (
                          <SelectItem key={role.value} value={role.value}>
                            {role.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteClick(collaborator)}
                      disabled={removeCollaboratorMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Collaborator Dialog */}
      <AddCollaboratorDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        projectId={projectId}
        existingCollaboratorIds={existingCollaboratorIds}
        onSuccess={handleAddSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Collaborator</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{' '}
              <strong>{collaboratorToDelete?.user.full_name}</strong> from this
              project? They will no longer have access to the project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeCollaboratorMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={removeCollaboratorMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeCollaboratorMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
