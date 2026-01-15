import { useState } from 'react';
import {
  Calendar,
  User,
  Upload,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
  RotateCcw,
  Eye,
  Play,
  Send,
  Edit,
  MessageSquare,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export type TaskType = 'document_upload' | 'form_completion' | 'approval_required';

export type TaskWorkflowStatus =
  | 'pending'
  | 'in_progress'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'revision_required'
  | 'completed'
  | 'blocked'
  | 'cancelled';

export interface TaskCardData {
  id: number;
  title: string;
  description?: string;
  taskType?: TaskType | string;
  status: TaskWorkflowStatus;
  dueDate?: string;
  assignedTo?: {
    id: string;
    name: string;
  };
  isRequired?: boolean;
  reviewerComments?: string;
  submittedAt?: string;
  reviewedAt?: string;
  revisionCount?: number;
}

export interface TaskCardProps {
  task: TaskCardData;
  compact?: boolean;
  onStart?: (taskId: number) => void;
  onSubmit?: (taskId: number) => void;
  onView?: (taskId: number) => void;
  onRevise?: (taskId: number) => void;
  onResubmit?: (taskId: number) => void;
  className?: string;
}

const statusConfig: Record<
  TaskWorkflowStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'; icon: any }
> = {
  pending: { label: 'Pending', variant: 'secondary', icon: Clock },
  in_progress: { label: 'In Progress', variant: 'default', icon: Clock },
  submitted: { label: 'Submitted', variant: 'warning', icon: Send },
  approved: { label: 'Approved', variant: 'success', icon: CheckCircle },
  rejected: { label: 'Rejected', variant: 'destructive', icon: XCircle },
  revision_required: { label: 'Revision Required', variant: 'warning', icon: RotateCcw },
  completed: { label: 'Completed', variant: 'success', icon: CheckCircle },
  blocked: { label: 'Blocked', variant: 'destructive', icon: AlertCircle },
  cancelled: { label: 'Cancelled', variant: 'outline', icon: XCircle },
};

const taskTypeConfig: Record<string, { label: string; icon: any; color: string }> = {
  document_upload: { label: 'Document Upload', icon: Upload, color: 'text-blue-500' },
  form_completion: { label: 'Form Completion', icon: FileText, color: 'text-green-500' },
  approval_required: { label: 'Approval Required', icon: CheckCircle, color: 'text-purple-500' },
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isOverdue(task: TaskCardData): boolean {
  if (task.status === 'completed' || task.status === 'approved' || task.status === 'cancelled') {
    return false;
  }
  if (!task.dueDate) return false;
  return new Date(task.dueDate) < new Date();
}

export function TaskCard({
  task,
  compact = false,
  onStart,
  onSubmit,
  onView,
  onRevise,
  onResubmit,
  className,
}: TaskCardProps) {
  const [showFeedback, setShowFeedback] = useState(false);

  const config = statusConfig[task.status] || statusConfig.pending;
  const StatusIcon = config.icon;
  const typeConfig = task.taskType ? taskTypeConfig[task.taskType] : null;
  const TypeIcon = typeConfig?.icon;
  const overdue = isOverdue(task);

  const canStart = task.status === 'pending' || task.status === 'in_progress';
  const canSubmit = task.status === 'pending' || task.status === 'in_progress';
  const canView = task.status === 'approved' || task.status === 'completed';
  const canRevise = task.status === 'rejected' || task.status === 'revision_required';
  const canResubmit = task.status === 'rejected' || task.status === 'revision_required';
  const hasFeedback = !!task.reviewerComments;

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg border transition-colors',
          overdue && 'border-destructive bg-destructive/5',
          task.status === 'completed' || task.status === 'approved'
            ? 'opacity-60'
            : 'hover:bg-muted/50',
          className
        )}
      >
        <StatusIcon
          className={cn(
            'h-4 w-4 shrink-0',
            config.variant === 'success' && 'text-green-500',
            config.variant === 'destructive' && 'text-destructive',
            config.variant === 'warning' && 'text-yellow-500',
            config.variant === 'default' && 'text-primary',
            config.variant === 'secondary' && 'text-muted-foreground'
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'font-medium truncate',
                (task.status === 'completed' || task.status === 'approved') && 'line-through'
              )}
            >
              {task.title}
            </span>
            {task.isRequired && (
              <span className="text-xs text-destructive">*</span>
            )}
          </div>
          {task.dueDate && (
            <span
              className={cn(
                'text-xs',
                overdue ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              Due: {formatDate(task.dueDate)}
            </span>
          )}
        </div>
        <Badge variant={config.variant} className="shrink-0">
          {config.label}
        </Badge>
      </div>
    );
  }

  return (
    <Card className={cn(overdue && 'border-destructive', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">{task.title}</CardTitle>
              {task.isRequired && (
                <Badge variant="outline" className="text-xs">
                  Required
                </Badge>
              )}
            </div>
            {task.description && (
              <CardDescription>{task.description}</CardDescription>
            )}
          </div>
          <Badge variant={config.variant} className="shrink-0 ml-2">
            <StatusIcon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {/* Task Type Indicator */}
          {typeConfig && TypeIcon && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5">
                    <TypeIcon className={cn('h-4 w-4', typeConfig.color)} />
                    <span>{typeConfig.label}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Task type: {typeConfig.label}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Due Date */}
          {task.dueDate && (
            <div className={cn('flex items-center gap-1.5', overdue && 'text-destructive')}>
              <Calendar className="h-4 w-4" />
              <span>{overdue ? 'Overdue: ' : 'Due: '}{formatDate(task.dueDate)}</span>
            </div>
          )}

          {/* Assigned User */}
          {task.assignedTo && (
            <div className="flex items-center gap-1.5">
              <User className="h-4 w-4" />
              <span>{task.assignedTo.name}</span>
            </div>
          )}

          {/* Revision Count */}
          {task.revisionCount !== undefined && task.revisionCount > 0 && (
            <div className="flex items-center gap-1.5">
              <RotateCcw className="h-4 w-4" />
              <span>{task.revisionCount} revision{task.revisionCount > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* Reviewer Feedback Section */}
        {hasFeedback && (
          <Collapsible open={showFeedback} onOpenChange={setShowFeedback} className="mt-4">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
                <MessageSquare className="h-4 w-4" />
                <span>Reviewer Feedback</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {showFeedback ? 'Hide' : 'Show'}
                </span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 p-3 rounded-md bg-muted/50 text-sm">
                <p className="whitespace-pre-wrap">{task.reviewerComments}</p>
                {task.reviewedAt && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Reviewed on {formatDate(task.reviewedAt)}
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>

      <CardFooter className="pt-0">
        <div className="flex flex-wrap gap-2 w-full">
          {/* Actions based on status */}
          {canStart && onStart && (
            <Button size="sm" variant="outline" onClick={() => onStart(task.id)}>
              <Play className="h-4 w-4 mr-1" />
              Start
            </Button>
          )}

          {canSubmit && onSubmit && (
            <Button size="sm" onClick={() => onSubmit(task.id)}>
              <Send className="h-4 w-4 mr-1" />
              Submit for Review
            </Button>
          )}

          {canView && onView && (
            <Button size="sm" variant="outline" onClick={() => onView(task.id)}>
              <Eye className="h-4 w-4 mr-1" />
              View
            </Button>
          )}

          {canRevise && onRevise && (
            <Button size="sm" variant="outline" onClick={() => onRevise(task.id)}>
              <Edit className="h-4 w-4 mr-1" />
              Revise
            </Button>
          )}

          {canResubmit && onResubmit && (
            <Button size="sm" onClick={() => onResubmit(task.id)}>
              <Send className="h-4 w-4 mr-1" />
              Resubmit
            </Button>
          )}

          {task.status === 'submitted' && (
            <div className="text-sm text-muted-foreground italic">
              Awaiting review...
            </div>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

export default TaskCard;
