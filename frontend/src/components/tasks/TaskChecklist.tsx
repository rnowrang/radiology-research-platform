import { useState, useMemo } from 'react';
import {
  CheckCircle,
  Clock,
  AlertCircle,
  List,
  LayoutGrid,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { TaskCard, TaskCardData, TaskWorkflowStatus } from './TaskCard';

export interface TaskChecklistProps {
  tasks: TaskCardData[];
  projectId?: string;
  title?: string;
  showProgressBar?: boolean;
  defaultView?: 'card' | 'list';
  onTaskStart?: (taskId: number) => void;
  onTaskSubmit?: (taskId: number) => void;
  onTaskView?: (taskId: number) => void;
  onTaskRevise?: (taskId: number) => void;
  onTaskResubmit?: (taskId: number) => void;
  onUploadComplete?: () => void;
  className?: string;
}

type StatusGroup = {
  key: string;
  label: string;
  count: number;
  variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
  icon: any;
};

function getStatusGroup(status: TaskWorkflowStatus): StatusGroup['key'] {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'in_progress':
      return 'in_progress';
    case 'submitted':
      return 'submitted';
    case 'approved':
    case 'completed':
      return 'completed';
    case 'rejected':
    case 'revision_required':
      return 'needs_action';
    case 'blocked':
    case 'cancelled':
      return 'blocked';
    default:
      return 'pending';
  }
}

export function TaskChecklist({
  tasks,
  projectId,
  title = 'Tasks',
  showProgressBar = true,
  defaultView = 'card',
  onTaskStart,
  onTaskSubmit,
  onTaskView,
  onTaskRevise,
  onTaskResubmit,
  onUploadComplete,
  className,
}: TaskChecklistProps) {
  const [viewMode, setViewMode] = useState<'card' | 'list'>(defaultView);
  const [requiredExpanded, setRequiredExpanded] = useState(true);
  const [optionalExpanded, setOptionalExpanded] = useState(true);

  // Compute stats
  const stats = useMemo(() => {
    const total = tasks.length;
    const completed = tasks.filter(
      (t) => t.status === 'completed' || t.status === 'approved'
    ).length;
    const pending = tasks.filter((t) => t.status === 'pending').length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const submitted = tasks.filter((t) => t.status === 'submitted').length;
    const needsAction = tasks.filter(
      (t) => t.status === 'rejected' || t.status === 'revision_required'
    ).length;
    const blocked = tasks.filter(
      (t) => t.status === 'blocked' || t.status === 'cancelled'
    ).length;

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      pending,
      inProgress,
      submitted,
      needsAction,
      blocked,
      percentage,
    };
  }, [tasks]);

  // Group tasks by required/optional
  const { requiredTasks, optionalTasks } = useMemo(() => {
    const required = tasks.filter((t) => t.isRequired !== false);
    const optional = tasks.filter((t) => t.isRequired === false);
    return { requiredTasks: required, optionalTasks: optional };
  }, [tasks]);

  // Status summary chips configuration
  const statusChips: StatusGroup[] = [
    {
      key: 'pending',
      label: 'Pending',
      count: stats.pending,
      variant: 'secondary',
      icon: Clock,
    },
    {
      key: 'in_progress',
      label: 'In Progress',
      count: stats.inProgress,
      variant: 'default',
      icon: Clock,
    },
    {
      key: 'submitted',
      label: 'Submitted',
      count: stats.submitted,
      variant: 'warning',
      icon: AlertCircle,
    },
    {
      key: 'completed',
      label: 'Completed',
      count: stats.completed,
      variant: 'success',
      icon: CheckCircle,
    },
    {
      key: 'needs_action',
      label: 'Needs Action',
      count: stats.needsAction,
      variant: 'destructive',
      icon: AlertCircle,
    },
  ];

  const renderTaskList = (taskList: TaskCardData[], emptyMessage: string) => {
    if (taskList.length === 0) {
      return (
        <div className="text-sm text-muted-foreground italic py-4 text-center">
          {emptyMessage}
        </div>
      );
    }

    if (viewMode === 'list') {
      return (
        <div className="space-y-2">
          {taskList.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              projectId={projectId}
              compact
              onStart={onTaskStart}
              onSubmit={onTaskSubmit}
              onView={onTaskView}
              onRevise={onTaskRevise}
              onResubmit={onTaskResubmit}
              onUploadComplete={onUploadComplete}
            />
          ))}
        </div>
      );
    }

    return (
      <div className="grid gap-4 md:grid-cols-2">
        {taskList.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            projectId={projectId}
            onStart={onTaskStart}
            onSubmit={onTaskSubmit}
            onView={onTaskView}
            onRevise={onTaskRevise}
            onResubmit={onTaskResubmit}
            onUploadComplete={onUploadComplete}
          />
        ))}
      </div>
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with title and view toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'card' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode('card')}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      {showProgressBar && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">
              {stats.completed} of {stats.total} completed ({stats.percentage}%)
            </span>
          </div>
          <Progress
            value={stats.percentage}
            className={cn(
              'h-2',
              stats.percentage === 100 && '[&>div]:bg-green-500'
            )}
          />
        </div>
      )}

      {/* Status Summary Chips */}
      <div className="flex flex-wrap gap-2">
        {statusChips
          .filter((chip) => chip.count > 0)
          .map((chip) => {
            const Icon = chip.icon;
            return (
              <Badge
                key={chip.key}
                variant={chip.variant}
                className="gap-1.5"
              >
                <Icon className="h-3 w-3" />
                {chip.count} {chip.label}
              </Badge>
            );
          })}
      </div>

      <Separator />

      {/* Required Tasks Section */}
      {requiredTasks.length > 0 && (
        <Collapsible open={requiredExpanded} onOpenChange={setRequiredExpanded}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between p-0 h-auto hover:bg-transparent"
            >
              <div className="flex items-center gap-2">
                {requiredExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <span className="font-medium">Required Tasks</span>
                <Badge variant="outline" className="ml-2">
                  {requiredTasks.filter(
                    (t) => t.status === 'completed' || t.status === 'approved'
                  ).length}
                  /{requiredTasks.length}
                </Badge>
              </div>
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4">
            {renderTaskList(requiredTasks, 'No required tasks')}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Optional Tasks Section */}
      {optionalTasks.length > 0 && (
        <>
          {requiredTasks.length > 0 && <Separator />}
          <Collapsible open={optionalExpanded} onOpenChange={setOptionalExpanded}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between p-0 h-auto hover:bg-transparent"
              >
                <div className="flex items-center gap-2">
                  {optionalExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <span className="font-medium">Optional Tasks</span>
                  <Badge variant="outline" className="ml-2">
                    {optionalTasks.filter(
                      (t) => t.status === 'completed' || t.status === 'approved'
                    ).length}
                    /{optionalTasks.length}
                  </Badge>
                </div>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              {renderTaskList(optionalTasks, 'No optional tasks')}
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      {/* Empty State */}
      {tasks.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No tasks</h3>
          <p className="text-muted-foreground mt-1">
            No tasks have been assigned to this project yet.
          </p>
        </div>
      )}
    </div>
  );
}

export default TaskChecklist;
