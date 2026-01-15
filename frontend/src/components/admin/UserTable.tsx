import { MoreHorizontal, Edit, Key, Unlock, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface UserListItem {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'reviewer' | 'researcher';
  isActive: boolean;
  emailVerified: boolean;
  lockedUntil: string | null;
  failedLoginAttempts: number;
  createdAt: string;
  updatedAt: string;
}

interface UserTableProps {
  users: UserListItem[];
  isLoading?: boolean;
  onEdit: (user: UserListItem) => void;
  onResetPassword: (user: UserListItem) => void;
  onUnlock: (user: UserListItem) => void;
  onDeactivate: (user: UserListItem) => void;
}

const roleConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  admin: { label: 'Admin', variant: 'default' },
  reviewer: { label: 'Reviewer', variant: 'secondary' },
  researcher: { label: 'Researcher', variant: 'outline' },
};

export function UserTable({
  users,
  isLoading = false,
  onEdit,
  onResetPassword,
  onUnlock,
  onDeactivate,
}: UserTableProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const isLocked = (user: UserListItem) => {
    return user.lockedUntil && new Date(user.lockedUntil) > new Date();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <h3 className="text-lg font-medium">No users found</h3>
        <p className="text-muted-foreground mt-1">
          Try adjusting your search or filter criteria
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="w-[70px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => {
          const roleInfo = roleConfig[user.role] || { label: user.role, variant: 'outline' as const };
          const locked = isLocked(user);

          return (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.fullName}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <Badge variant={roleInfo.variant}>{roleInfo.label}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {user.isActive ? (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="destructive">Inactive</Badge>
                  )}
                  {locked && (
                    <Badge variant="secondary" className="text-orange-600">
                      Locked
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>{formatDate(user.createdAt)}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Open menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(user)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit User
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onResetPassword(user)}>
                      <Key className="mr-2 h-4 w-4" />
                      Reset Password
                    </DropdownMenuItem>
                    {locked && (
                      <DropdownMenuItem onClick={() => onUnlock(user)}>
                        <Unlock className="mr-2 h-4 w-4" />
                        Unlock Account
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {user.isActive && (
                      <DropdownMenuItem
                        onClick={() => onDeactivate(user)}
                        className="text-destructive focus:text-destructive"
                      >
                        <UserX className="mr-2 h-4 w-4" />
                        Deactivate
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
