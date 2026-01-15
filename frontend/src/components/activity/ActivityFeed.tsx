import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Filter, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { activityApi, ActivityItem, ActivityListParams } from '@/lib/api';
import { ActivityItemComponent } from './ActivityItem';

export type ActivityFeedType = 'global' | 'project' | 'form' | 'user' | 'my';

interface ActivityFeedProps {
  type: ActivityFeedType;
  resourceId?: string | number;
  title?: string;
  showActorAvatar?: boolean;
  compact?: boolean;
  maxHeight?: string;
  showFilters?: boolean;
  pageSize?: number;
  className?: string;
}

const ACTION_FILTER_OPTIONS = [
  { value: 'all', label: 'All Actions' },
  { value: 'create', label: 'Created' },
  { value: 'update', label: 'Updated' },
  { value: 'delete', label: 'Deleted' },
  { value: 'approve', label: 'Approved' },
  { value: 'reject', label: 'Rejected' },
  { value: 'submit', label: 'Submitted' },
  { value: 'upload', label: 'Uploaded' },
  { value: 'download', label: 'Downloaded' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
];

const RESOURCE_TYPE_OPTIONS = [
  { value: 'all', label: 'All Resources' },
  { value: 'project', label: 'Projects' },
  { value: 'form_instance', label: 'Forms' },
  { value: 'template', label: 'Templates' },
  { value: 'user', label: 'Users' },
  { value: 'file', label: 'Files' },
];

export function ActivityFeed({
  type,
  resourceId,
  title = 'Activity',
  showActorAvatar = true,
  compact = false,
  maxHeight = '400px',
  showFilters = false,
  pageSize = 20,
  className,
}: ActivityFeedProps) {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [resourceTypeFilter, setResourceTypeFilter] = useState<string>('all');

  const queryParams: ActivityListParams = {
    page,
    limit: pageSize,
    ...(actionFilter !== 'all' && { action: actionFilter }),
    ...(resourceTypeFilter !== 'all' && { resource_type: resourceTypeFilter }),
  };

  const fetchActivity = async () => {
    switch (type) {
      case 'global':
        return activityApi.getGlobal(queryParams);
      case 'my':
        return activityApi.getMy(queryParams);
      case 'project':
        if (!resourceId || typeof resourceId !== 'string') {
          throw new Error('Project ID is required');
        }
        return activityApi.getProject(resourceId, queryParams);
      case 'form':
        if (!resourceId) {
          throw new Error('Form ID is required');
        }
        const formId = typeof resourceId === 'string' ? parseInt(resourceId, 10) : resourceId;
        return activityApi.getForm(formId, queryParams);
      case 'user':
        if (!resourceId || typeof resourceId !== 'string') {
          throw new Error('User ID is required');
        }
        return activityApi.getUser(resourceId, queryParams);
      default:
        throw new Error(`Unknown activity type: ${type}`);
    }
  };

  const {
    data,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['activity', type, resourceId, page, actionFilter, resourceTypeFilter],
    queryFn: fetchActivity,
  });

  const activities: ActivityItem[] = data?.data?.data || [];
  const pagination = data?.data?.pagination;
  const hasMore = pagination ? page < pagination.totalPages : false;
  const hasPrevious = page > 1;

  const handleLoadMore = () => {
    if (hasMore) {
      setPage((p) => p + 1);
    }
  };

  const handleLoadPrevious = () => {
    if (hasPrevious) {
      setPage((p) => p - 1);
    }
  };

  const handleFilterChange = (filter: 'action' | 'resource_type', value: string) => {
    if (filter === 'action') {
      setActionFilter(value);
    } else {
      setResourceTypeFilter(value);
    }
    setPage(1); // Reset to first page when filter changes
  };

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">{title}</h3>
          {isFetching && !isLoading && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>

        {showFilters && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8">
                <Filter className="h-4 w-4 mr-1" />
                Filters
                {(actionFilter !== 'all' || resourceTypeFilter !== 'all') && (
                  <span className="ml-1 h-2 w-2 rounded-full bg-primary" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64" align="end">
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Action Type
                  </label>
                  <Select
                    value={actionFilter}
                    onValueChange={(value) => handleFilterChange('action', value)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_FILTER_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {type === 'global' && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Resource Type
                    </label>
                    <Select
                      value={resourceTypeFilter}
                      onValueChange={(value) => handleFilterChange('resource_type', value)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RESOURCE_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(actionFilter !== 'all' || resourceTypeFilter !== 'all') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setActionFilter('all');
                      setResourceTypeFilter('all');
                      setPage(1);
                    }}
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <Separator className="mb-3" />

      {/* Content */}
      <ScrollArea style={{ height: maxHeight }}>
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : 'Failed to load activity'}
            </p>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="mt-2">
              Try Again
            </Button>
          </div>
        ) : activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <Activity className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No activity yet</p>
          </div>
        ) : (
          <div className="divide-y">
            {activities.map((activity) => (
              <ActivityItemComponent
                key={`${activity.source}-${activity.id}`}
                activity={activity}
                showActorAvatar={showActorAvatar}
                compact={compact}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Pagination */}
      {(hasMore || hasPrevious) && (
        <>
          <Separator className="mt-3" />
          <div className="flex items-center justify-between mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadPrevious}
              disabled={!hasPrevious || isFetching}
            >
              Previous
            </Button>
            {pagination && (
              <span className="text-xs text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLoadMore}
              disabled={!hasMore || isFetching}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Next'
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default ActivityFeed;
