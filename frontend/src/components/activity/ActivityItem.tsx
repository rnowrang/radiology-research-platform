import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  LogIn,
  LogOut,
  AlertCircle,
  Plus,
  Eye,
  Edit,
  Trash2,
  Download,
  Upload,
  CheckCircle,
  XCircle,
  Send,
  FileDown,
  Key,
  RefreshCw,
  MessageCircle,
  RotateCcw,
  MessageSquare,
  CheckSquare,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActivityItem as ActivityItemType } from '@/lib/api';

// Map icon names to Lucide icons
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'log-in': LogIn,
  'log-out': LogOut,
  'alert-circle': AlertCircle,
  'plus': Plus,
  'eye': Eye,
  'edit': Edit,
  'trash-2': Trash2,
  'download': Download,
  'upload': Upload,
  'check-circle': CheckCircle,
  'x-circle': XCircle,
  'send': Send,
  'file-down': FileDown,
  'key': Key,
  'refresh-cw': RefreshCw,
  'message-circle': MessageCircle,
  'rotate-ccw': RotateCcw,
  'message-square': MessageSquare,
  'check-square': CheckSquare,
  'activity': Activity,
};

interface ActivityItemProps {
  activity: ActivityItemType;
  showActorAvatar?: boolean;
  compact?: boolean;
  className?: string;
}

export function ActivityItemComponent({
  activity,
  showActorAvatar = true,
  compact = false,
  className,
}: ActivityItemProps) {
  const navigate = useNavigate();

  const Icon = iconMap[activity.icon] || Activity;
  const timeAgo = formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true });

  const handleClick = () => {
    if (activity.resource_link) {
      navigate(activity.resource_link);
    }
  };

  // Get actor initials for avatar
  const getInitials = () => {
    if (activity.actor.name) {
      return activity.actor.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (activity.actor.email) {
      return activity.actor.email[0].toUpperCase();
    }
    return '?';
  };

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 py-2',
          activity.resource_link && 'cursor-pointer hover:bg-accent rounded-md px-2 -mx-2',
          className
        )}
        onClick={handleClick}
      >
        <Icon className={cn('h-4 w-4 flex-shrink-0', activity.icon_color)} />
        <span className="text-sm text-muted-foreground truncate flex-1">
          {activity.description}
        </span>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {timeAgo}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-start gap-3 py-3',
        activity.resource_link && 'cursor-pointer hover:bg-accent/50 rounded-lg px-3 -mx-3',
        className
      )}
      onClick={handleClick}
    >
      {showActorAvatar ? (
        <div className="flex-shrink-0">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
            {getInitials()}
          </div>
        </div>
      ) : (
        <div className={cn('flex-shrink-0 mt-0.5', activity.icon_color)}>
          <Icon className="h-5 w-5" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm">
            <span className="font-medium">
              {activity.actor.name || activity.actor.email || 'Unknown user'}
            </span>{' '}
            <span className="text-muted-foreground">{activity.action_label}</span>
            {activity.resource_type !== 'user' && activity.resource_id && (
              <>
                {' '}
                <span className="text-muted-foreground">{activity.resource_type_label}</span>
                {activity.details && (activity.details.title || activity.details.name) && (
                  <>
                    {' '}
                    <span className="font-medium">
                      "{String(activity.details.title || activity.details.name)}"
                    </span>
                  </>
                )}
              </>
            )}
          </p>
          {showActorAvatar && (
            <Icon className={cn('h-4 w-4 flex-shrink-0', activity.icon_color)} />
          )}
        </div>

        {/* Show field change details */}
        {activity.source === 'field_change' && activity.details && (
          <div className="mt-1 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
            <span className="font-medium">
              {String(activity.details.field_label || activity.resource_id)}
            </span>
            : changed from "{String(activity.details.old_value ?? 'empty')}" to "
            {String(activity.details.new_value ?? 'empty')}"
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-1">{timeAgo}</p>
      </div>
    </div>
  );
}

export default ActivityItemComponent;
