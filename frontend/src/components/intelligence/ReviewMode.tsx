/**
 * Review Mode - Coherence checking and submission readiness
 *
 * Matching questionnaire wizard appearance with:
 * - Sidebar with coherence summary and checklist
 * - Card-based conflict display
 * - Consistent navigation
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIntelligenceStore } from '@/stores/intelligenceStore';
import * as intelligenceApi from '@/lib/intelligenceApi';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Loader2,
  ChevronRight,
  FileCheck,
  Shield,
  ArrowRight,
  Check,
  Circle,
} from 'lucide-react';

interface ReviewModeProps {
  projectId: string;
  coherenceStatus?: {
    coherenceScore?: number;
    score?: number;
  };
  onRefresh?: () => void;
}

interface Conflict {
  id: string;
  rule_id: string;
  severity: 'error' | 'warning' | 'info';
  description: string;
  fact_key: string;
  conflicting_values: Array<{
    source: string;
    value: string;
    document?: string;
  }>;
  resolution_options: string[];
  status: 'detected' | 'acknowledged' | 'resolved' | 'ignored';
  detected_at: string;
}

interface ReadinessItem {
  id: string;
  label: string;
  description: string;
  status: 'complete' | 'incomplete' | 'warning';
  category: 'required' | 'recommended';
  emoji: string;
}

export function ReviewMode({ projectId, coherenceStatus, onRefresh }: ReviewModeProps) {
  const queryClient = useQueryClient();
  const [selectedConflict, setSelectedConflict] = useState<string | null>(null);
  const [selectedResolution, setSelectedResolution] = useState<string>('');

  const { coherenceScore, setCoherenceScore, getProgress } = useIntelligenceStore();

  const progress = getProgress();

  // Fetch coherence status
  const coherenceQuery = useQuery({
    queryKey: ['coherence-status', projectId],
    queryFn: () => intelligenceApi.getCoherenceStatus(projectId),
    enabled: !!projectId,
    refetchInterval: 30000,
  });

  // Fetch conflicts
  const conflictsQuery = useQuery({
    queryKey: ['coherence-conflicts', projectId],
    queryFn: () => intelligenceApi.getCoherenceConflicts(projectId),
    enabled: !!projectId,
  });

  // Refresh coherence mutation
  const refreshMutation = useMutation({
    mutationFn: () => intelligenceApi.triggerCoherenceCheck(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coherence-status', projectId] });
      queryClient.invalidateQueries({ queryKey: ['coherence-conflicts', projectId] });
      onRefresh?.();
    },
  });

  // Resolve conflict mutation
  const resolveMutation = useMutation({
    mutationFn: ({
      conflictId,
      resolution,
    }: {
      conflictId: string;
      resolution: string;
    }) => intelligenceApi.resolveConflict(projectId, conflictId, {
      resolution: resolution as 'adopt_source_value' | 'adopt_form_value' | 'mark_intentional_difference' | 'provide_new_value' | 'defer',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coherence-status', projectId] });
      queryClient.invalidateQueries({ queryKey: ['coherence-conflicts', projectId] });
      setSelectedConflict(null);
      setSelectedResolution('');
    },
  });

  // Update store when coherence data changes
  const apiScore = coherenceStatus?.coherenceScore ?? coherenceStatus?.score ?? coherenceQuery.data?.coherenceScore ?? 100;
  if (apiScore !== undefined && apiScore !== coherenceScore) {
    setCoherenceScore(apiScore);
  }

  const conflicts: Conflict[] = conflictsQuery.data?.conflicts || [];
  const activeConflicts = conflicts.filter(
    (c) => c.status === 'detected' || c.status === 'acknowledged'
  );
  const errorConflicts = activeConflicts.filter((c) => c.severity === 'error');
  const warningConflicts = activeConflicts.filter((c) => c.severity === 'warning');
  const resolvedConflicts = conflicts.filter((c) => c.status === 'resolved');

  // Build readiness checklist
  const readinessItems: ReadinessItem[] = [
    {
      id: 'no-errors',
      label: 'No critical errors',
      description: 'All critical coherence issues must be resolved',
      status: errorConflicts.length === 0 ? 'complete' : 'incomplete',
      category: 'required',
      emoji: '🚨',
    },
    {
      id: 'warnings-reviewed',
      label: 'Warnings reviewed',
      description: 'All warnings should be reviewed and addressed',
      status:
        warningConflicts.length === 0
          ? 'complete'
          : warningConflicts.length <= 2
          ? 'warning'
          : 'incomplete',
      category: 'recommended',
      emoji: '⚠️',
    },
    {
      id: 'coherence-score',
      label: 'Coherence above 80%',
      description: 'Document consistency should be high',
      status:
        apiScore >= 80
          ? 'complete'
          : apiScore >= 60
          ? 'warning'
          : 'incomplete',
      category: 'recommended',
      emoji: '📊',
    },
    {
      id: 'questionnaire',
      label: 'Questionnaire complete',
      description: 'Answer all required questions',
      status: progress.completionPercentage >= 80 ? 'complete' : progress.completionPercentage >= 50 ? 'warning' : 'incomplete',
      category: 'required',
      emoji: '📋',
    },
  ];

  const requiredComplete = readinessItems
    .filter((i) => i.category === 'required')
    .every((i) => i.status === 'complete');

  const completedItems = readinessItems.filter((i) => i.status === 'complete').length;

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBg = (score: number) => {
    if (score >= 90) return 'bg-green-100';
    if (score >= 70) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const handleResolve = () => {
    if (selectedConflict && selectedResolution) {
      resolveMutation.mutate({
        conflictId: selectedConflict,
        resolution: selectedResolution,
      });
    }
  };

  const selectedConflictData = conflicts.find((c) => c.id === selectedConflict);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r bg-muted/30 flex flex-col h-full shrink-0">
        {/* Coherence Score */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Coherence Score</span>
            <span className={cn('text-sm font-bold', getScoreColor(apiScore))}>
              {apiScore}%
            </span>
          </div>
          <Progress value={apiScore} className="h-2" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{errorConflicts.length} errors</span>
            <span>{warningConflicts.length} warnings</span>
          </div>
        </div>

        {/* Readiness Checklist */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            <h3 className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Submission Checklist
            </h3>
            {readinessItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'flex items-start gap-3 px-3 py-3 rounded-lg mb-1',
                  item.status === 'complete' && 'bg-green-50',
                  item.status === 'warning' && 'bg-yellow-50',
                  item.status === 'incomplete' && 'bg-red-50'
                )}
              >
                <div className="mt-0.5">
                  {item.status === 'complete' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : item.status === 'warning' ? (
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{item.emoji}</span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Summary Stats */}
        <div className="p-4 border-t bg-background">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="p-2 rounded bg-muted/50">
              <div className="text-lg font-semibold text-green-600">
                {completedItems}
              </div>
              <div className="text-xs text-muted-foreground">Ready</div>
            </div>
            <div className="p-2 rounded bg-muted/50">
              <div className="text-lg font-semibold text-amber-600">
                {readinessItems.length - completedItems}
              </div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Review & Submit
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              {refreshMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
          <Progress value={(completedItems / readinessItems.length) * 100} className="h-1" />
        </div>

        {/* Content area */}
        <div className="flex-1 p-6 overflow-auto">
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Coherence Score Card */}
            <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-6">
                  <div
                    className={cn(
                      'w-20 h-20 rounded-full flex items-center justify-center',
                      getScoreBg(apiScore)
                    )}
                  >
                    <span className={cn('text-2xl font-bold', getScoreColor(apiScore))}>
                      {apiScore}%
                    </span>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-purple-900 mb-1">
                      Coherence Score
                    </h3>
                    <p className="text-sm text-purple-700">
                      {apiScore >= 90
                        ? 'Excellent! Your documents are highly consistent.'
                        : apiScore >= 70
                        ? 'Good consistency, but some issues need attention.'
                        : 'Several inconsistencies detected. Please review and resolve.'}
                    </p>
                    <div className="flex gap-4 mt-3">
                      <div className="flex items-center gap-1.5">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span className="text-sm">{errorConflicts.length} Critical</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm">{warningConflicts.length} Warnings</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm">{resolvedConflicts.length} Resolved</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Conflicts List */}
            {activeConflicts.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">⚠️ Issues</Badge>
                  </div>
                  <h3 className="text-lg font-semibold">Issues to Resolve</h3>
                  <p className="text-sm text-muted-foreground">
                    Address these issues to improve your coherence score
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeConflicts.map((conflict) => (
                    <button
                      key={conflict.id}
                      onClick={() => setSelectedConflict(conflict.id)}
                      className={cn(
                        'w-full text-left p-4 rounded-lg border transition-colors',
                        selectedConflict === conflict.id
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted/50'
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {conflict.severity === 'error' ? (
                          <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{conflict.fact_key}</span>
                            <Badge
                              variant={
                                conflict.severity === 'error'
                                  ? 'destructive'
                                  : 'secondary'
                              }
                            >
                              {conflict.severity}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {conflict.description}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {conflict.conflicting_values.map((cv, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {cv.source}: {cv.value}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* No issues state */}
            {activeConflicts.length === 0 && (
              <Card>
                <CardContent className="pt-6 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-3">
                    <CheckCircle2 className="h-6 w-6 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No Issues Found</h3>
                  <p className="text-sm text-muted-foreground">
                    Your documents are consistent. You're ready to submit!
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Resolution Panel (shown when conflict selected) */}
            {selectedConflictData && (
              <Card className="border-primary">
                <CardHeader className="pb-3">
                  <Badge variant="outline" className="w-fit">🔧 Resolution</Badge>
                  <h3 className="text-lg font-semibold">Resolve: {selectedConflictData.fact_key}</h3>
                  <p className="text-sm text-muted-foreground">{selectedConflictData.description}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Conflicting Values</h4>
                    <div className="space-y-2">
                      {selectedConflictData.conflicting_values.map((cv, i) => (
                        <div key={i} className="p-3 rounded bg-muted/50 border">
                          <div className="font-medium text-sm">{cv.source}</div>
                          <div className="text-muted-foreground text-sm">{cv.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-2">Choose Resolution</h4>
                    <RadioGroup
                      value={selectedResolution}
                      onValueChange={setSelectedResolution}
                    >
                      {selectedConflictData.resolution_options.map((option) => (
                        <div
                          key={option}
                          className="flex items-center space-x-2 p-2 rounded hover:bg-muted"
                        >
                          <RadioGroupItem value={option} id={option} />
                          <Label htmlFor={option} className="text-sm cursor-pointer">
                            {option === 'adopt_source_value'
                              ? 'Use source document value'
                              : option === 'adopt_form_value'
                              ? 'Use form value'
                              : option === 'mark_intentional_difference'
                              ? 'Mark as intentional difference'
                              : option}
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                </CardContent>
                <CardFooter className="flex justify-end gap-2 border-t pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedConflict(null);
                      setSelectedResolution('');
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleResolve}
                    disabled={!selectedResolution || resolveMutation.isPending}
                  >
                    {resolveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    Apply Resolution
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-background shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {requiredComplete
                ? 'Ready for submission'
                : 'Complete required items to proceed'}
            </span>
          </div>
          <Button disabled={!requiredComplete}>
            Submit for Review
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ReviewMode;
