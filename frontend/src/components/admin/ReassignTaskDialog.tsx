import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Search, User, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/useToast';
import { api, tasksApi } from '@/lib/api';
import { cn } from '@/lib/utils';

// User type for the list
interface UserOption {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

// Props interface as specified in requirements
export interface ReassignTaskDialogProps {
  taskId: number | null;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

/**
 * Dialog component for assigning or reassigning an existing task to a user.
 * Features user search and selection functionality.
 */
export function ReassignTaskDialog({
  taskId,
  projectId,
  open,
  onOpenChange,
  onSuccess,
}: ReassignTaskDialogProps) {
  const { toast } = useToast();

  // Local state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchTerm('');
      setSelectedUserId(null);
    }
  }, [open]);

  // Fetch users for the list
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users', projectId],
    queryFn: async () => {
      const response = await api.get('/admin/users', {
        params: { is_active: true, limit: 100 },
      });
      return response.data.data as UserOption[];
    },
    enabled: open,
  });

  // Filter users by search term
  const filteredUsers =
    users?.filter(
      (user) =>
        user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

  // Mutation for assigning the task
  const assignTaskMutation = useMutation({
    mutationFn: (userId: string) => tasksApi.assign(taskId!, userId),
    onSuccess: () => {
      toast({ title: 'Task assigned successfully' });
      setSearchTerm('');
      setSelectedUserId(null);
      onSuccess();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        variant: 'destructive',
        title: 'Failed to assign task',
        description: err.response?.data?.error || 'An error occurred',
      });
    },
  });

  // Handle assignment
  const handleAssign = () => {
    if (selectedUserId && taskId) {
      assignTaskMutation.mutate(selectedUserId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Task</DialogTitle>
          <DialogDescription>
            Search and select a user to assign this task to
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* User list */}
          <div className="max-h-60 overflow-y-auto border rounded-md">
            {usersLoading ? (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                {searchTerm ? 'No users found' : 'Start typing to search users'}
              </div>
            ) : (
              filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className={cn(
                    'flex items-center gap-3 p-3 cursor-pointer hover:bg-muted',
                    selectedUserId === user.id && 'bg-primary/10'
                  )}
                  onClick={() => setSelectedUserId(user.id)}
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{user.full_name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>
                  {selectedUserId === user.id && (
                    <CheckCircle className="ml-auto h-5 w-5 text-primary flex-shrink-0" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssign}
            disabled={!selectedUserId || assignTaskMutation.isPending || !taskId}
          >
            {assignTaskMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
