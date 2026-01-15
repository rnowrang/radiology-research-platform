import { useMemo } from 'react';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface TaskProgressBarProps {
  completed: number;
  total: number;
  showPercentage?: boolean;
  showCount?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function TaskProgressBar({
  completed,
  total,
  showPercentage = true,
  showCount = true,
  size = 'md',
  className,
}: TaskProgressBarProps) {
  const percentage = useMemo(() => {
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  }, [completed, total]);

  const colorClass = useMemo(() => {
    if (percentage === 100) return '[&>div]:bg-green-500';
    if (percentage >= 75) return '[&>div]:bg-emerald-500';
    if (percentage >= 50) return '[&>div]:bg-yellow-500';
    if (percentage >= 25) return '[&>div]:bg-orange-500';
    return '[&>div]:bg-primary';
  }, [percentage]);

  const heightClass = useMemo(() => {
    switch (size) {
      case 'sm':
        return 'h-1.5';
      case 'lg':
        return 'h-4';
      case 'md':
      default:
        return 'h-2.5';
    }
  }, [size]);

  const tooltipContent = (
    <div className="text-center">
      <p className="font-medium">{percentage}% Complete</p>
      <p className="text-xs text-muted-foreground">
        {completed} of {total} task{total !== 1 ? 's' : ''} completed
      </p>
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('space-y-1', className)}>
            {(showPercentage || showCount) && (
              <div className="flex items-center justify-between text-sm">
                {showCount && (
                  <span className="text-muted-foreground">
                    {completed}/{total} tasks
                  </span>
                )}
                {showPercentage && (
                  <span className="font-medium ml-auto">{percentage}%</span>
                )}
              </div>
            )}
            <Progress
              value={percentage}
              className={cn(heightClass, colorClass)}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>{tooltipContent}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export interface TaskProgressStatsProps {
  stats: {
    pending: number;
    inProgress: number;
    submitted: number;
    completed: number;
    needsAction: number;
    total: number;
  };
  showLabels?: boolean;
  className?: string;
}

export function TaskProgressStats({
  stats,
  showLabels = true,
  className,
}: TaskProgressStatsProps) {
  const total = stats.total;

  const segments = [
    { key: 'completed', count: stats.completed, color: 'bg-green-500', label: 'Completed' },
    { key: 'submitted', count: stats.submitted, color: 'bg-yellow-500', label: 'Submitted' },
    { key: 'inProgress', count: stats.inProgress, color: 'bg-blue-500', label: 'In Progress' },
    { key: 'needsAction', count: stats.needsAction, color: 'bg-red-500', label: 'Needs Action' },
    { key: 'pending', count: stats.pending, color: 'bg-gray-300', label: 'Pending' },
  ];

  return (
    <TooltipProvider>
      <div className={cn('space-y-2', className)}>
        {/* Multi-segment progress bar */}
        <div className="h-3 w-full rounded-full bg-secondary overflow-hidden flex">
          {segments.map((segment) => {
            if (segment.count === 0) return null;
            const width = (segment.count / total) * 100;
            return (
              <Tooltip key={segment.key}>
                <TooltipTrigger asChild>
                  <div
                    className={cn('h-full transition-all', segment.color)}
                    style={{ width: `${width}%` }}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {segment.count} {segment.label}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Legend */}
        {showLabels && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {segments
              .filter((s) => s.count > 0)
              .map((segment) => (
                <div key={segment.key} className="flex items-center gap-1.5">
                  <div
                    className={cn('h-2.5 w-2.5 rounded-full', segment.color)}
                  />
                  <span className="text-muted-foreground">
                    {segment.label}: {segment.count}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

export default TaskProgressBar;
