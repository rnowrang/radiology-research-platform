import { useState, useEffect, useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, Search, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/useToast';
import { projectsApi, usersApi } from '@/lib/api';
import type { CollaboratorRole } from './CollaboratorsManagement';

// =============================================================================
// Types
// =============================================================================

interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  isActive: boolean;
}

interface AddCollaboratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  existingCollaboratorIds: string[];
  onSuccess: () => void;
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

const DEBOUNCE_DELAY = 300;

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

export function AddCollaboratorDialog({
  open,
  onOpenChange,
  projectId,
  existingCollaboratorIds,
  onSuccess,
}: AddCollaboratorDialogProps) {
  const { toast } = useToast();

  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<CollaboratorRole>('research_assistant');

  // Refs
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchTerm('');
      setSearchResults([]);
      setShowDropdown(false);
      setSelectedUser(null);
      setSelectedRole('research_assistant');
    }
  }, [open]);

  // Debounced search
  const performSearch = useCallback(
    async (term: string) => {
      if (!term.trim()) {
        setSearchResults([]);
        setShowDropdown(false);
        return;
      }

      setIsSearching(true);
      try {
        const response = await usersApi.list({ search: term, is_active: true });
        const users = response.data.data as User[];

        // Filter out users who are already collaborators
        const filteredUsers = users.filter(
          (user) => !existingCollaboratorIds.includes(user.id)
        );

        setSearchResults(filteredUsers);
        setShowDropdown(true);
      } catch (error) {
        console.error('Error searching users:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [existingCollaboratorIds]
  );

  // Handle search input change with debounce
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setSelectedUser(null);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout for debounced search
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(value);
    }, DEBOUNCE_DELAY);
  };

  // Handle user selection
  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setSearchTerm(user.fullName);
    setShowDropdown(false);
  };

  // Clear selection
  const handleClearSelection = () => {
    setSelectedUser(null);
    setSearchTerm('');
    setSearchResults([]);
    setShowDropdown(false);
  };

  // Add collaborator mutation
  const addCollaboratorMutation = useMutation({
    mutationFn: () =>
      projectsApi.addCollaborator(projectId, {
        user_id: selectedUser!.id,
        role: selectedRole,
      }),
    onSuccess: () => {
      toast({ title: 'Collaborator added successfully' });
      onSuccess();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: err.response?.data?.error || 'Failed to add collaborator',
      });
    },
  });

  const handleSubmit = () => {
    if (!selectedUser) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please select a user to add',
      });
      return;
    }
    addCollaboratorMutation.mutate();
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Collaborator</DialogTitle>
          <DialogDescription>
            Search for a user to add as a collaborator to this project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* User Search */}
          <div className="space-y-2">
            <Label htmlFor="userSearch">User</Label>
            <div className="relative" ref={dropdownRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="userSearch"
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => {
                    if (searchResults.length > 0 && !selectedUser) {
                      setShowDropdown(true);
                    }
                  }}
                  className="pl-9 pr-9"
                  disabled={addCollaboratorMutation.isPending}
                />
                {selectedUser && (
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    disabled={addCollaboratorMutation.isPending}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* Search Results Dropdown */}
              {showDropdown && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
                  {searchResults.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground text-center">
                      {isSearching ? 'Searching...' : 'No users found'}
                    </div>
                  ) : (
                    <ul className="max-h-60 overflow-auto py-1">
                      {searchResults.map((user) => (
                        <li key={user.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectUser(user)}
                            className="flex items-center gap-3 w-full px-3 py-2 text-left hover:bg-accent transition-colors"
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {getInitials(user.fullName)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">
                                {user.fullName}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {user.email}
                              </p>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Selected User Display */}
            {selectedUser && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm">
                  Selected: <strong>{selectedUser.fullName}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Role Selection */}
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={selectedRole}
              onValueChange={(value) => setSelectedRole(value as CollaboratorRole)}
              disabled={addCollaboratorMutation.isPending}
            >
              <SelectTrigger id="role">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={addCollaboratorMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedUser || addCollaboratorMutation.isPending}
          >
            {addCollaboratorMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
