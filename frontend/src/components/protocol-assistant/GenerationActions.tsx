import { Button } from '@/components/ui/button';
import { FileText, FileCheck, FilePlus, Loader2 } from 'lucide-react';

interface GenerationActionsProps {
  onGenerateAbstract: () => void;
  onGenerateConsent: () => void;
  onGenerateProtocol: () => void;
  onGenerateAll: () => void;
  isGenerating: boolean;
  generatingType?: string;
  disabled?: boolean;
}

export function GenerationActions({
  onGenerateAbstract,
  onGenerateConsent,
  onGenerateProtocol,
  onGenerateAll,
  isGenerating,
  generatingType,
  disabled,
}: GenerationActionsProps) {
  return (
    <div className="flex flex-wrap gap-2 p-3 border-t bg-muted/50">
      <Button
        size="sm"
        variant="outline"
        onClick={onGenerateAbstract}
        disabled={disabled || isGenerating}
      >
        {isGenerating && generatingType === 'abstract' ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <FileText className="mr-1 h-4 w-4" />
        )}
        Generate Abstract
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onGenerateConsent}
        disabled={disabled || isGenerating}
      >
        {isGenerating && generatingType === 'consent' ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <FileCheck className="mr-1 h-4 w-4" />
        )}
        Consent Form
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={onGenerateProtocol}
        disabled={disabled || isGenerating}
      >
        {isGenerating && generatingType === 'protocol' ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <FilePlus className="mr-1 h-4 w-4" />
        )}
        Full Protocol
      </Button>
      <Button
        size="sm"
        variant="default"
        onClick={onGenerateAll}
        disabled={disabled || isGenerating}
      >
        {isGenerating && generatingType === 'all' ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <FilePlus className="mr-1 h-4 w-4" />
        )}
        Generate All
      </Button>
    </div>
  );
}
