import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  FileCheck,
  RefreshCw,
  MessageSquare,
  ClipboardList,
  AtSign,
  Clock,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export interface Notification {
  id: number;
  user_id: string;
  type: string;
  title: string;
  message?: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationPanelProps {
  notifications: Notification[];
  isLoading: boolean;
  onMarkAsRead: (id: number) => void;
  onMarkAllAsRead: () => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}

const notificationIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  approval_request: FileCheck,
  status_change: RefreshCw,
  comment: MessageSquare,
  task_assigned: ClipboardList,
  mention: AtSign,
  reminder: Clock,
};

const notificationColors: Record<string, string> = {
  approval_request: 'text-blue-500',
  status_change: 'text-green-500',
  comment: 'text-purple-500',
  task_assigned: 'text-orange-500',
  mention: 'text-pink-500',
  reminder: 'text-yellow-500',
};

function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
  onClose,
}: {
  notification: Notification;
  onMarkAsRead: (id: number) => void;
  onDelete: (id: number) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  const Icon = notificationIcons[notification.type] || MessageSquare;
  const iconColor = notificationColors[notification.type] || 'text-muted-foreground';

  const handleClick = () => {
    if (!notification.is_read) {
      onMarkAsRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
      onClose();
    }
  };

  const handleMarkRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMarkAsRead(notification.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(notification.id);
  };

  const timeAgo = formatDistanceToNow(new Date(notification.created_at), { addSuffix: true });

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 cursor-pointer transition-colors hover:bg-accent',
        !notification.is_read && 'bg-accent/50'
      )}
      onClick={handleClick}
    >
      <div className={cn('mt-0.5 flex-shrink-0', iconColor)}>
        <Icon className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              'text-sm font-medium leading-tight',
              notification.is_read && 'text-muted-foreground'
            )}
          >
            {notification.title}
          </p>
          {!notification.is_read && (
            <span className="flex-shrink-0 h-2 w-2 rounded-full bg-primary" />
          )}
        </div>

        {notification.message && (
          <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
            {notification.message}
          </p>
        )}

        <p className="text-xs text-muted-foreground mt-1">{timeAgo}</p>
      </div>

      <div className="flex flex-col gap-1 flex-shrink-0">
        {!notification.is_read && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleMarkRead}
            title="Mark as read"
          >
            <Check className="h-3 w-3" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={handleDelete}
          title="Delete"
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export function NotificationPanel({
  notifications,
  isLoading,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onClose,
}: NotificationPanelProps) {
  const navigate = useNavigate();
  const hasUnread = notifications.some((n) => !n.is_read);

  const handleViewAll = () => {
    navigate('/notifications');
    onClose();
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="font-semibold">Notifications</h3>
        {hasUnread && (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto py-1 px-2 text-xs"
            onClick={onMarkAllAsRead}
          >
            Mark all as read
          </Button>
        )}
      </div>

      <Separator />

      <ScrollArea className="h-[400px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-pulse text-muted-foreground">Loading...</div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkAsRead={onMarkAsRead}
                onDelete={onDelete}
                onClose={onClose}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <Separator />

      <div className="p-2">
        <Button
          variant="ghost"
          className="w-full justify-center text-sm"
          onClick={handleViewAll}
        >
          View all notifications
        </Button>
      </div>
    </div>
  );
}

export default NotificationPanel;
