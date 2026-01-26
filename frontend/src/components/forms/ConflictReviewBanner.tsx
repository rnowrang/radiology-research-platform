import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConflictReviewBannerProps {
  conflictCount: number;
  onDismiss: () => void;
}

export function ConflictReviewBanner({ conflictCount, onDismiss }: ConflictReviewBannerProps) {
  return (
    <div className="fixed top-0 left-0 right-0 bg-yellow-50 border-b border-yellow-200 p-3 z-50">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
          <span className="font-medium text-yellow-800">
            {conflictCount} field{conflictCount !== 1 ? 's' : ''} have pre-fill conflicts
          </span>
          <span className="text-sm text-yellow-700">
            Review highlighted fields below
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="text-yellow-700 hover:text-yellow-900 hover:bg-yellow-100"
        >
          <X className="h-4 w-4 mr-1" />
          Dismiss
        </Button>
      </div>
    </div>
  );
}
