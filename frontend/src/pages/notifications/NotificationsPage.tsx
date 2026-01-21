import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Filter,
  Loader2,
  MessageSquare,
  AlertCircle,
  UserPlus,
  AtSign,
  ClipboardCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/useToast';
import { notificationsApi } from '@/lib/api';

// Notification type from the gateway
type NotificationType =
  | 'approval_request'
  | 'status_change'
  | 'comment'
  | 'task_assigned'
  | 'mention'
  | 'reminder';

interface Notification {
  id: number;
  user_id: string;
  type: NotificationType;
  title: string;
  message?: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationsResponse {
  data: Notification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Icons for each notification type
const notificationIcons: Record<NotificationType, React.ElementType> = {
  approval_request: ClipboardCheck,
  status_change: AlertCircle,
  comment: MessageSquare,
  task_assigned: UserPlus,
  mention: AtSign,
  reminder: Clock,
};

// Colors for notification type badges
const notificationColors: Record<NotificationType, string> = {
  approval_request: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  status_change: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  comment: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  task_assigned: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  mention: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  reminder: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
};

// Readable type labels
const notificationTypeLabels: Record<NotificationType, string> = {
  approval_request: 'Approval Request',
  status_change: 'Status Change',
  comment: 'Comment',
  task_assigned: 'Task Assigned',
  mention: 'Mention',
  reminder: 'Reminder',
};

// Format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks} week${diffInWeeks === 1 ? '' : 's'} ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths === 1 ? '' : 's'} ago`;
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears} year${diffInYears === 1 ? '' : 's'} ago`;
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filter states
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [readFilter, setReadFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Fetch notifications with server-side filtering
  const { data: notificationsData, isLoading } = useQuery<NotificationsResponse>({
    queryKey: ['notifications', page, limit, typeFilter, readFilter],
    queryFn: async () => {
      const params: { page: number; limit: number; type?: string; is_read?: boolean } = {
        page,
        limit,
      };

      // Add type filter if not 'all'
      if (typeFilter !== 'all') {
        params.type = typeFilter;
      }

      // Add read status filter if not 'all'
      if (readFilter === 'unread') {
        params.is_read = false;
      } else if (readFilter === 'read') {
        params.is_read = true;
      }

      const response = await notificationsApi.list(params);
      return response.data as NotificationsResponse;
    },
  });

  // Fetch unread count for badge
  const { data: unreadCountData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const response = await notificationsApi.getUnreadCount();
      return response.data.data.count as number;
    },
  });

  // Mark single notification as read
  const markAsReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
    onError: () => {
      toast({
        variant: 'destructive',
        title: 'Failed to mark notification as read',
      });
    },
  });

  // Mark all notifications as read
  const markAllAsReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onSuccess: () => {
      toast({
        title: 'All notifications marked as read',
      });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
    onError: () => {
      toast({
        variant: 'destructive',
        title: 'Failed to mark all notifications as read',
      });
    },
  });

  const notifications = notificationsData?.data || [];
  const pagination = notificationsData?.pagination;
  const unreadCount = unreadCountData ?? 0;

  // Reset page when filters change
  const handleTypeFilterChange = (value: string) => {
    setTypeFilter(value);
    setPage(1);
  };

  const handleReadFilterChange = (value: string) => {
    setReadFilter(value);
    setPage(1);
  };

  // Handle notification click
  const handleNotificationClick = (notification: Notification) => {
    // Mark as read if not already
    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id);
    }
    // Navigate to linked resource
    if (notification.link) {
      navigate(notification.link);
    }
  };

  // Handle mark as read button click (without navigation)
  const handleMarkAsRead = (e: React.MouseEvent, notification: Notification) => {
    e.stopPropagation();
    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">
            Stay updated on your forms, tasks, and reviews
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Badge variant="secondary" className="mr-2">
              {unreadCount} unread
            </Badge>
          )}
          <Button
            variant="outline"
            onClick={() => markAllAsReadMutation.mutate()}
            disabled={markAllAsReadMutation.isPending || unreadCount === 0}
          >
            {markAllAsReadMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="mr-2 h-4 w-4" />
            )}
            Mark all as read
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={typeFilter} onValueChange={handleTypeFilterChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="approval_request">Approval Requests</SelectItem>
            <SelectItem value="status_change">Status Changes</SelectItem>
            <SelectItem value="comment">Comments</SelectItem>
            <SelectItem value="task_assigned">Task Assigned</SelectItem>
            <SelectItem value="mention">Mentions</SelectItem>
            <SelectItem value="reminder">Reminders</SelectItem>
          </SelectContent>
        </Select>
        <Select value={readFilter} onValueChange={handleReadFilterChange}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unread">Unread</SelectItem>
            <SelectItem value="read">Read</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Notifications List */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </div>
          </CardTitle>
          <CardDescription>
            {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
            {typeFilter !== 'all' && ` (filtered by ${notificationTypeLabels[typeFilter as NotificationType]})`}
            {readFilter !== 'all' && ` - ${readFilter}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BellOff className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No notifications</h3>
              <p className="text-muted-foreground mt-1">
                {typeFilter !== 'all' || readFilter !== 'all'
                  ? 'No notifications match your filters'
                  : "You're all caught up!"}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {notifications.map((notification, index) => {
                const Icon = notificationIcons[notification.type] || Bell;
                const colorClass = notificationColors[notification.type] || '';

                return (
                  <div key={notification.id}>
                    {index > 0 && <Separator className="my-1" />}
                    <div
                      onClick={() => handleNotificationClick(notification)}
                      className={`
                        group flex items-start gap-4 p-4 rounded-lg cursor-pointer
                        transition-colors hover:bg-muted/50
                        ${!notification.is_read ? 'bg-muted/30' : ''}
                      `}
                    >
                      {/* Icon */}
                      <div
                        className={`
                          flex-shrink-0 rounded-full p-2
                          ${colorClass || 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'}
                        `}
                      >
                        <Icon className="h-4 w-4" />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-medium ${
                                  !notification.is_read ? 'text-foreground' : 'text-muted-foreground'
                                }`}
                              >
                                {notification.title}
                              </span>
                              {!notification.is_read && (
                                <span className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                              )}
                            </div>
                            {notification.message && (
                              <p
                                className={`text-sm mt-1 line-clamp-2 ${
                                  !notification.is_read
                                    ? 'text-muted-foreground'
                                    : 'text-muted-foreground/70'
                                }`}
                              >
                                {notification.message}
                              </p>
                            )}
                            <div className="flex items-center gap-3 mt-2">
                              <Badge variant="outline" className="text-xs">
                                {notificationTypeLabels[notification.type]}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {formatRelativeTime(notification.created_at)}
                              </span>
                            </div>
                          </div>

                          {/* Mark as read button (visible on hover for unread) */}
                          {!notification.is_read && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleMarkAsRead(e, notification)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Mark as read"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Link indicator */}
                      {notification.link && (
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
