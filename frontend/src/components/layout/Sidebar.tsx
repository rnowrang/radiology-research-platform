import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  FolderKanban,
  FileText,
  ClipboardCheck,
  CheckSquare,
  Users,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Workflow,
  BarChart3,
  Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/stores/authStore';
import { reviewApi, tasksApi, projectsApi } from '@/lib/api';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface AdminPendingCounts {
  reviewQueue: number;
  taskReview: number;
  projectReview: number;
}

function useAdminPendingCounts(isAdmin: boolean): AdminPendingCounts {
  // Fetch form review queue count
  const { data: reviewQueueData } = useQuery({
    queryKey: ['adminReviewQueueCount'],
    queryFn: async () => {
      const response = await reviewApi.getQueue();
      return response.data.data as Array<{ id: number }>;
    },
    enabled: isAdmin,
    staleTime: 30000, // Cache for 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });

  // Fetch pending task review count
  const { data: taskReviewData } = useQuery({
    queryKey: ['adminTaskReviewCount'],
    queryFn: async () => {
      const response = await tasksApi.getPendingReview();
      return response.data;
    },
    enabled: isAdmin,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  // Fetch projects pending approval count
  const { data: projectReviewData } = useQuery({
    queryKey: ['adminProjectReviewCount'],
    queryFn: async () => {
      const response = await projectsApi.list();
      const projects = response.data.data as Array<{ id: string; status: string }>;
      return projects.filter((p) => p.status === 'pending_approval');
    },
    enabled: isAdmin,
    staleTime: 30000,
    refetchInterval: 60000,
  });

  return {
    reviewQueue: reviewQueueData?.length || 0,
    taskReview: taskReviewData?.pagination?.total || taskReviewData?.data?.length || 0,
    projectReview: projectReviewData?.length || 0,
  };
}

const mainNavItems = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Projects',
    href: '/projects',
    icon: FolderKanban,
  },
  {
    title: 'Forms',
    href: '/forms',
    icon: FileText,
  },
  {
    title: 'Tasks',
    href: '/tasks',
    icon: CheckSquare,
  },
  {
    title: 'Review Queue',
    href: '/review',
    icon: ClipboardCheck,
    roles: ['admin', 'reviewer'] as const,
  },
];

type BadgeKey = 'reviewQueue' | 'taskReview' | 'projectReview';

interface AdminNavItem {
  title: string;
  href: string;
  icon: typeof LayoutDashboard;
  badgeKey?: BadgeKey;
}

const adminNavItems: AdminNavItem[] = [
  {
    title: 'Dashboard',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    title: 'Project Review',
    href: '/projects?status=pending_approval',
    icon: FolderKanban,
    badgeKey: 'projectReview',
  },
  {
    title: 'Review Queue',
    href: '/review',
    icon: ClipboardCheck,
    badgeKey: 'reviewQueue',
  },
  {
    title: 'Task Review',
    href: '/admin/task-review',
    icon: CheckSquare,
    badgeKey: 'taskReview',
  },
  {
    title: 'Users',
    href: '/admin/users',
    icon: Users,
  },
  {
    title: 'Workflow Config',
    href: '/admin/workflow-config',
    icon: Workflow,
  },
  {
    title: 'Review Stages',
    href: '/admin/review-stages',
    icon: GitBranch,
  },
  {
    title: 'Audit Logs',
    href: '/admin/audit',
    icon: FileText,
  },
  {
    title: 'Reports',
    href: '/admin/reports',
    icon: BarChart3,
  },
  {
    title: 'Email',
    href: '/admin/email',
    icon: Mail,
  },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const pendingCounts = useAdminPendingCounts(isAdmin || false);

  const filteredMainNav = mainNavItems.filter((item) => {
    if (!item.roles) return true;
    return user && (item.roles as readonly string[]).includes(user.role);
  });

  const showAdminNav = isAdmin;

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-50 flex h-screen flex-col border-r bg-card transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex h-16 items-center justify-between border-b px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <FileText className="h-5 w-5" />
            </div>
            <span className="font-semibold">Research Platform</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className={cn(collapsed && 'mx-auto')}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {filteredMainNav.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  collapsed && 'justify-center px-2'
                )
              }
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.title}</span>}
            </NavLink>
          ))}
        </nav>

        {showAdminNav && (
          <>
            <Separator className="my-4" />
            {!collapsed && (
              <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Admin
              </div>
            )}
            <nav className="space-y-1">
              {adminNavItems.map((item) => {
                const badgeCount = item.badgeKey ? pendingCounts[item.badgeKey] : 0;
                return (
                  <NavLink
                    key={item.href}
                    to={item.href}
                    className={({ isActive }) =>
                      cn(
                        'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        collapsed && 'justify-center px-2'
                      )
                    }
                  >
                    <item.icon className="h-5 w-5 shrink-0" />
                    {!collapsed && (
                      <span className="flex-1">{item.title}</span>
                    )}
                    {badgeCount > 0 && !collapsed && (
                      <Badge
                        variant="secondary"
                        className="ml-auto h-5 min-w-5 justify-center px-1.5 text-xs"
                      >
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </Badge>
                    )}
                    {badgeCount > 0 && collapsed && (
                      <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </>
        )}
      </ScrollArea>

      <div className="border-t p-4">
        {!collapsed && (
          <div className="text-xs text-muted-foreground">
            <p>Version 1.0.0</p>
          </div>
        )}
      </div>
    </aside>
  );
}
