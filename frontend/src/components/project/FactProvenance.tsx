/**
 * Fact Provenance - Shows the source and history of a fact
 *
 * Displays:
 * - Current value and source
 * - Confidence level
 * - Version history
 * - Documents that reference this fact
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  History,
  FileText,
  CheckCircle2,
  Clock,
  User,
  Link2,
  Shield,
  Loader2,
  ChevronRight,
} from 'lucide-react';
import * as learningApi from '@/lib/learningApi';

interface FactProvenanceProps {
  projectId: string;
  factKey: string;
  currentValue?: string;
  children?: React.ReactNode;
  className?: string;
}

export function FactProvenance({
  projectId,
  factKey,
  currentValue,
  children,
  className,
}: FactProvenanceProps) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch provenance
  const provenanceQuery = useQuery({
    queryKey: ['fact-provenance', projectId, factKey],
    queryFn: () => learningApi.getProvenance(projectId, factKey),
    enabled: isOpen && !!projectId && !!factKey,
  });

  // Fetch history
  const historyQuery = useQuery({
    queryKey: ['fact-history', projectId, factKey],
    queryFn: () => learningApi.getFactHistory(projectId, factKey, 20),
    enabled: isOpen && !!projectId && !!factKey,
  });

  // Verify fact mutation
  const verifyMutation = useMutation({
    mutationFn: () => learningApi.verifyFact(projectId, factKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fact-provenance', projectId, factKey] });
    },
  });

  const provenance = provenanceQuery.data;
  const history = historyQuery.data?.history || [];

  const getSourceLabel = (source: string): string => {
    const labels: Record<string, string> = {
      document_extraction: 'Extracted from document',
      wizard_answer: 'Questionnaire answer',
      user_input: 'User input',
      form_sync: 'Form sync',
      ai_suggestion: 'AI suggestion',
    };
    return labels[source] || source;
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'document_extraction':
        return <FileText className="h-4 w-4" />;
      case 'wizard_answer':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'ai_suggestion':
        return <Shield className="h-4 w-4" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="ghost" size="sm" className={className}>
            <History className="h-4 w-4 mr-1" />
            History
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Fact Provenance</DialogTitle>
          <DialogDescription>
            Source and history for <code className="text-xs bg-muted px-1 rounded">{factKey}</code>
          </DialogDescription>
        </DialogHeader>

        {provenanceQuery.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : provenanceQuery.isError || !provenance ? (
          <div className="py-8 text-center text-muted-foreground">
            No provenance data available for this fact.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current Value */}
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="text-xs text-muted-foreground mb-1">Current Value</div>
              <div className="font-medium">
                {provenance.current_value || currentValue || '(empty)'}
              </div>
            </div>

            {/* Source Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Source</div>
                <div className="flex items-center gap-2">
                  {getSourceIcon(provenance.primary_source)}
                  <span className="text-sm">{getSourceLabel(provenance.primary_source)}</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Confidence</div>
                <Badge
                  variant={
                    provenance.confidence >= 0.9
                      ? 'default'
                      : provenance.confidence >= 0.7
                      ? 'secondary'
                      : 'outline'
                  }
                >
                  {Math.round(provenance.confidence * 100)}%
                </Badge>
              </div>
            </div>

            {/* Verification Status */}
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-2">
                {provenance.verified_by_user ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-700">
                      Verified{' '}
                      {provenance.verified_at && formatDate(provenance.verified_at)}
                    </span>
                  </>
                ) : (
                  <>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Not verified</span>
                  </>
                )}
              </div>
              {!provenance.verified_by_user && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => verifyMutation.mutate()}
                  disabled={verifyMutation.isPending}
                >
                  {verifyMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Verify'
                  )}
                </Button>
              )}
            </div>

            {/* References */}
            {provenance.referenced_by && provenance.referenced_by.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-2">Referenced By</div>
                <div className="flex flex-wrap gap-2">
                  {provenance.referenced_by.map((ref, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      <Link2 className="h-3 w-3 mr-1" />
                      {ref.type}: {ref.id.slice(0, 8)}...
                      {ref.field && ` (${ref.field})`}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* History */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Version History</span>
                <span className="text-xs text-muted-foreground">
                  v{provenance.version}
                </span>
              </div>

              <ScrollArea className="h-48">
                {historyQuery.isLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : history.length === 0 ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    No history available
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((entry, i) => (
                      <div
                        key={entry.id}
                        className={cn(
                          'flex items-start gap-3 p-2 rounded',
                          i === 0 && 'bg-muted/30'
                        )}
                      >
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs">
                          {entry.version}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {entry.value || '(empty)'}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {getSourceIcon(entry.source)}
                            <span>{getSourceLabel(entry.source)}</span>
                            {entry.confidence && (
                              <span>({Math.round(entry.confidence * 100)}%)</span>
                            )}
                          </div>
                          {entry.change_reason && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Reason: {entry.change_reason}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatDate(entry.created_at)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default FactProvenance;
