import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sparkles, FileText, Brain, Users, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfidenceBadgeProps {
  confidence: number;
  confidenceLevel?: 'high' | 'medium' | 'low';
  source?: string;
  evidence?: string;
  className?: string;
}

const levelConfig = {
  high: {
    color: 'bg-green-100 text-green-800 border-green-200',
    label: 'High confidence',
    description: 'This value is very likely correct based on multiple sources.',
  },
  medium: {
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    label: 'Medium confidence',
    description: 'This value may need review. Consider verifying before submitting.',
  },
  low: {
    color: 'bg-red-100 text-red-800 border-red-200',
    label: 'Low confidence',
    description: 'This value needs review. It may not be accurate.',
  },
};

const sourceIcons: Record<string, React.ElementType> = {
  document: FileText,
  wizard: Users,
  ai: Brain,
  learned: Sparkles,
};

export function ConfidenceBadge({
  confidence,
  confidenceLevel,
  source,
  evidence,
  className,
}: ConfidenceBadgeProps) {
  // Determine level from confidence if not provided
  const level = confidenceLevel ||
    (confidence >= 0.85 ? 'high' : confidence >= 0.6 ? 'medium' : 'low');

  const config = levelConfig[level];
  const SourceIcon = source ? sourceIcons[source] || Sparkles : Sparkles;
  const percentConfidence = Math.round(confidence * 100);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'gap-1 text-xs font-normal cursor-help',
              config.color,
              className
            )}
          >
            <SourceIcon className="h-3 w-3" />
            <span>{percentConfidence}%</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">{config.label}</p>
            <p className="text-xs text-muted-foreground">{config.description}</p>
            {source && (
              <p className="text-xs">
                <strong>Source:</strong> {source}
              </p>
            )}
            {evidence && (
              <p className="text-xs mt-1 p-2 bg-muted rounded">
                {evidence}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface AIFilledIndicatorProps {
  confidence: number;
  onViewDetails?: () => void;
}

export function AIFilledIndicator({
  confidence,
  onViewDetails,
}: AIFilledIndicatorProps) {
  const level = confidence >= 0.85 ? 'high' : confidence >= 0.6 ? 'medium' : 'low';
  const config = levelConfig[level];

  return (
    <div className={cn(
      'flex items-center gap-2 px-2 py-1 rounded text-xs',
      config.color.replace('border-', 'border border-')
    )}>
      <Sparkles className="h-3 w-3" />
      <span>AI filled ({Math.round(confidence * 100)}%)</span>
      {onViewDetails && (
        <button
          onClick={onViewDetails}
          className="hover:underline flex items-center gap-0.5"
        >
          <HelpCircle className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
