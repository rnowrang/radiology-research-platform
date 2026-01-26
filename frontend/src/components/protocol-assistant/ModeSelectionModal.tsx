import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sparkles, MessageSquare } from 'lucide-react';

interface ModeSelectionModalProps {
  open: boolean;
  onSelect: (mode: 'guided' | 'chat') => void;
  gapCount: number;
}

export function ModeSelectionModal({ open, onSelect, gapCount }: ModeSelectionModalProps) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Protocol Analysis Complete
          </DialogTitle>
          <DialogDescription>
            We found {gapCount} question{gapCount !== 1 ? 's' : ''} to help complete your protocol.
            How would you like to proceed?
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Guided Mode Option */}
          <button
            onClick={() => onSelect('guided')}
            className="flex items-start gap-4 p-4 rounded-lg border-2 border-primary bg-primary/5 hover:bg-primary/10 transition-colors text-left"
          >
            <div className="p-2 rounded-full bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Guided Mode (Recommended)</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Answer questions one at a time with smart suggestions.
                We'll guide you through completing your protocol step by step.
              </p>
            </div>
          </button>

          {/* Free Chat Option */}
          <button
            onClick={() => onSelect('chat')}
            className="flex items-start gap-4 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left"
          >
            <div className="p-2 rounded-full bg-muted">
              <MessageSquare className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Free Chat</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Continue with the traditional chat interface.
                Ask questions and get help in a conversational way.
              </p>
            </div>
          </button>
        </div>

        <DialogFooter className="text-sm text-muted-foreground">
          You can switch modes anytime using the toggle in the header.
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
