import { useQuery } from '@tanstack/react-query';
import {
  Check,
  Circle,
  Clock,
  AlertCircle,
  XCircle,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { reviewStagesApi, ReviewProgressResponse, StageReviewInfo } from '@/lib/api';
import { cn } from '@/lib/utils';

interface StageProgressProps {
  formId: number;
  onStageClick?: (stage: StageReviewInfo) => void;
  className?: string;
  compact?: boolean;
}

const statusConfig: Record<
  string,
  { icon: React.ReactNode; color: string; label: string }
> = {
  not_started: {
    icon: <Circle className="h-4 w-4" />,
    color: 'text-muted-foreground',
    label: 'Not Started',
  },
  pending: {
    icon: <Clock className="h-4 w-4" />,
    color: 'text-yellow-500',
    label: 'Pending',
  },
  assigned: {
    icon: <Clock className="h-4 w-4" />,
    color: 'text-blue-500',
    label: 'Assigned',
  },
  in_progress: {
    icon: <RefreshCw className="h-4 w-4 animate-spin" />,
    color: 'text-blue-500',
    label: 'In Progress',
  },
  approved: {
    icon: <Check className="h-4 w-4" />,
    color: 'text-green-500',
    label: 'Approved',
  },
  rejected: {
    icon: <XCircle className="h-4 w-4" />,
    color: 'text-red-500',
    label: 'Rejected',
  },
  revision_required: {
    icon: <AlertCircle className="h-4 w-4" />,
    color: 'text-orange-500',
    label: 'Needs Revision',
  },
};

export function StageProgress({
  formId,
  onStageClick,
  className,
  compact = false,
}: StageProgressProps) {
  const { data: progress, isLoading } = useQuery({
    queryKey: ['formReviewProgress', formId],
    queryFn: async () => {
      const response = await reviewStagesApi.getFormProgress(formId);
      return response.data.data as ReviewProgressResponse;
    },
  });

  if (isLoading) {
    return (
      <div className={cn('animate-pulse', className)}>
        <div className="flex items-center gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-muted" />
              <div className="h-4 w-20 rounded bg-muted" />
              {i < 3 && <div className="h-0.5 w-8 bg-muted" />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!progress || !progress.stages.length) {
    return (
      <div className={cn('text-sm text-muted-foreground', className)}>
        No review stages configured
      </div>
    );
  }

  if (compact) {
    return (
      <CompactProgress
        progress={progress}
        onStageClick={onStageClick}
        className={className}
      />
    );
  }

  return (
    <FullProgress
      progress={progress}
      onStageClick={onStageClick}
      className={className}
    />
  );
}

function CompactProgress({
  progress,
  onStageClick,
  className,
}: {
  progress: ReviewProgressResponse;
  onStageClick?: (stage: StageReviewInfo) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <TooltipProvider>
        {progress.stages.map((stage, index) => {
          const config = statusConfig[stage.status] || statusConfig.not_started;
          return (
            <Tooltip key={stage.stage_id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onStageClick?.(stage)}
                  className={cn(
                    'flex items-center justify-center h-6 w-6 rounded-full transition-colors',
                    config.color,
                    stage.status === 'approved'
                      ? 'bg-green-500/10'
                      : stage.status === 'rejected'
                      ? 'bg-red-500/10'
                      : 'bg-muted',
                    onStageClick && 'cursor-pointer hover:bg-accent'
                  )}
                >
                  {config.icon}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm">
                  <div className="font-medium">{stage.stage_name}</div>
                  <div className="text-muted-foreground">{config.label}</div>
                  {stage.reviewer_name && (
                    <div className="text-xs mt-1">
                      Reviewer: {stage.reviewer_name}
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </TooltipProvider>
      <div className="ml-2 text-xs text-muted-foreground">
        {progress.completed_stages}/{progress.total_stages}
      </div>
    </div>
  );
}

function FullProgress({
  progress,
  onStageClick,
  className,
}: {
  progress: ReviewProgressResponse;
  onStageClick?: (stage: StageReviewInfo) => void;
  className?: string;
}) {
  return (
    <div className={cn('space-y-4', className)}>
      {/* Progress Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Review Progress</h3>
          {progress.current_stage_name && (
            <p className="text-sm text-muted-foreground">
              Current: {progress.current_stage_name}
            </p>
          )}
        </div>
        <Badge variant="outline">
          {progress.completed_stages}/{progress.total_stages} stages (
          {progress.progress_percentage}%)
        </Badge>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${progress.progress_percentage}%` }}
        />
      </div>

      {/* Stages List */}
      <div className="relative">
        <div className="flex items-start justify-between">
          {progress.stages.map((stage, index) => {
            const config = statusConfig[stage.status] || statusConfig.not_started;
            const isLast = index === progress.stages.length - 1;
            const isCurrent = progress.current_stage_id === stage.stage_id;

            return (
              <div
                key={stage.stage_id}
                className={cn(
                  'flex flex-col items-center flex-1',
                  onStageClick && 'cursor-pointer'
                )}
                onClick={() => onStageClick?.(stage)}
              >
                {/* Stage Icon */}
                <div
                  className={cn(
                    'flex items-center justify-center h-10 w-10 rounded-full border-2 transition-all',
                    stage.status === 'approved'
                      ? 'bg-green-500/10 border-green-500'
                      : stage.status === 'rejected'
                      ? 'bg-red-500/10 border-red-500'
                      : isCurrent
                      ? 'bg-primary/10 border-primary'
                      : 'bg-muted border-muted-foreground/30',
                    config.color
                  )}
                >
                  {config.icon}
                </div>

                {/* Stage Info */}
                <div className="mt-2 text-center">
                  <div
                    className={cn(
                      'text-sm font-medium',
                      isCurrent && 'text-primary'
                    )}
                  >
                    {stage.stage_name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {config.label}
                  </div>
                  {stage.reviewer_name && (
                    <div className="text-xs text-muted-foreground">
                      {stage.reviewer_name}
                    </div>
                  )}
                  {stage.deadline && (
                    <div className="text-xs text-muted-foreground">
                      Due: {new Date(stage.deadline).toLocaleDateString()}
                    </div>
                  )}
                </div>

                {/* Connector Line */}
                {!isLast && (
                  <div className="absolute top-5 left-0 right-0 flex justify-center -z-10">
                    <ChevronRight
                      className={cn(
                        'h-5 w-5',
                        stage.status === 'approved'
                          ? 'text-green-500'
                          : 'text-muted-foreground/30'
                      )}
                      style={{
                        marginLeft: `${(100 / progress.stages.length) * (index + 0.5)}%`,
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default StageProgress;
