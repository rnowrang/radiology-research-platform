import { CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfidenceIndicatorProps {
  confidence?: number;
  extractedValue: string;
}

export function ConfidenceIndicator({ confidence, extractedValue }: ConfidenceIndicatorProps) {
  // Default to medium confidence if not specified
  const score = confidence ?? 0.5;

  let Icon: typeof CheckCircle2;
  let label: string;
  let colorClass: string;
  let bgClass: string;

  if (score >= 0.8) {
    Icon = CheckCircle2;
    label = 'Extracted from document';
    colorClass = 'text-green-600';
    bgClass = 'bg-green-50 border-green-200';
  } else if (score >= 0.5) {
    Icon = AlertTriangle;
    label = 'Please verify';
    colorClass = 'text-yellow-600';
    bgClass = 'bg-yellow-50 border-yellow-200';
  } else {
    Icon = AlertCircle;
    label = 'Needs your input';
    colorClass = 'text-red-600';
    bgClass = 'bg-red-50 border-red-200';
  }

  return (
    <div className={cn('rounded-lg p-3 border', bgClass)}>
      <div className="flex items-start gap-3">
        <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', colorClass)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('text-sm font-medium', colorClass)}>{label}</span>
            {confidence !== undefined && (
              <span className="text-xs text-muted-foreground">
                ({Math.round(score * 100)}% confidence)
              </span>
            )}
          </div>
          <p className="text-sm text-foreground">
            <span className="font-medium">Found:</span> {extractedValue}
          </p>
        </div>
      </div>
    </div>
  );
}
