import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Plus, Trash2 } from 'lucide-react';
import type { AmendmentFieldChange } from '@/types';

interface AmendmentDiffProps {
  changes: AmendmentFieldChange[];
  showJustification?: boolean;
}

export function AmendmentDiff({ changes, showJustification = true }: AmendmentDiffProps) {
  if (changes.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No field changes have been added to this amendment yet.
      </div>
    );
  }

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '(empty)';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.join(', ') || '(empty)';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const getChangeType = (change: AmendmentFieldChange): 'added' | 'removed' | 'modified' => {
    const oldEmpty = change.old_value === null || change.old_value === undefined || change.old_value === '';
    const newEmpty = change.new_value === null || change.new_value === undefined || change.new_value === '';

    if (oldEmpty && !newEmpty) return 'added';
    if (!oldEmpty && newEmpty) return 'removed';
    return 'modified';
  };

  const getChangeTypeLabel = (type: 'added' | 'removed' | 'modified') => {
    switch (type) {
      case 'added':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Added</Badge>;
      case 'removed':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Removed</Badge>;
      case 'modified':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Modified</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {changes.map((change) => {
        const changeType = getChangeType(change);

        return (
          <Card key={change.id} className="overflow-hidden">
            <CardHeader className="py-3 px-4 bg-muted/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  {change.field_label || change.field_id}
                </CardTitle>
                {getChangeTypeLabel(changeType)}
              </div>
              {change.field_label && (
                <p className="text-xs text-muted-foreground font-mono">{change.field_id}</p>
              )}
            </CardHeader>
            <CardContent className="py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Old Value */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Current Value
                  </p>
                  <div className={`p-3 rounded-md border ${
                    changeType === 'removed' ? 'bg-red-50 border-red-200' : 'bg-muted/30'
                  }`}>
                    <pre className="text-sm whitespace-pre-wrap break-words font-mono">
                      {formatValue(change.old_value)}
                    </pre>
                  </div>
                </div>

                {/* Arrow indicator (hidden on mobile, shown inline on desktop) */}
                <div className="hidden md:flex items-center justify-center absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </div>

                {/* New Value */}
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    New Value
                  </p>
                  <div className={`p-3 rounded-md border ${
                    changeType === 'added' ? 'bg-green-50 border-green-200' :
                    changeType === 'modified' ? 'bg-blue-50 border-blue-200' : 'bg-muted/30'
                  }`}>
                    <pre className="text-sm whitespace-pre-wrap break-words font-mono">
                      {formatValue(change.new_value)}
                    </pre>
                  </div>
                </div>
              </div>

              {/* Justification */}
              {showJustification && change.justification && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                    Justification
                  </p>
                  <p className="text-sm">{change.justification}</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// Compact version for summaries
interface AmendmentDiffSummaryProps {
  changes: AmendmentFieldChange[];
}

export function AmendmentDiffSummary({ changes }: AmendmentDiffSummaryProps) {
  if (changes.length === 0) {
    return <span className="text-muted-foreground">No changes</span>;
  }

  return (
    <div className="space-y-1">
      {changes.slice(0, 3).map((change) => (
        <div key={change.id} className="flex items-center gap-2 text-sm">
          <span className="font-medium truncate">
            {change.field_label || change.field_id}
          </span>
        </div>
      ))}
      {changes.length > 3 && (
        <span className="text-xs text-muted-foreground">
          +{changes.length - 3} more change{changes.length - 3 !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}
