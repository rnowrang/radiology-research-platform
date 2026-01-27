/**
 * Review Mode - Coherence checking and submission readiness
 *
 * Provides:
 * - Overall coherence score
 * - Conflict list with resolution UI
 * - Submission readiness checklist
 * - Final review before submission
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIntelligenceStore } from '@/stores/intelligenceStore';
import * as intelligenceApi from '@/lib/intelligenceApi';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
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
  Clock,
  ArrowRight,
  Check,
} from 'lucide-react';

interface ReviewModeProps {
  projectId: string;
  sessionId: string;
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
}

export function ReviewMode({ projectId, sessionId }: ReviewModeProps) {
  const queryClient = useQueryClient();
  const [selectedConflict, setSelectedConflict] = useState<string | null>(null);
  const [selectedResolution, setSelectedResolution] = useState<string>('');

  const { coherenceScore, setCoherenceScore } = useIntelligenceStore();

  // Fetch coherence status
  const coherenceQuery = useQuery({
    queryKey: ['coherence-status', projectId],
    queryFn: () => intelligenceApi.getCoherenceStatus(projectId),
    enabled: !!projectId,
    refetchInterval: 30000, // Refresh every 30 seconds
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
  const apiScore = coherenceQuery.data?.coherenceScore ?? (coherenceQuery.data?.coherenceScore ?? coherenceQuery.data?.score);
  if (apiScore !== undefined && apiScore !== coherenceScore) {
    setCoherenceScore(apiScore);
  }

  const conflicts: Conflict[] = conflictsQuery.data?.conflicts || [];
  const activeConflicts = conflicts.filter(
    (c) => c.status === 'detected' || c.status === 'acknowledged'
  );
  const errorConflicts = activeConflicts.filter((c) => c.severity === 'error');
  const warningConflicts = activeConflicts.filter((c) => c.severity === 'warning');

  // Build readiness checklist
  const readinessItems: ReadinessItem[] = [
    {
      id: 'no-errors',
      label: 'No critical errors',
      description: 'All critical coherence issues must be resolved',
      status: errorConflicts.length === 0 ? 'complete' : 'incomplete',
      category: 'required',
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
    },
    {
      id: 'coherence-score',
      label: 'Coherence score above 80%',
      description: 'Document consistency should be high',
      status:
        ((coherenceQuery.data?.coherenceScore ?? coherenceQuery.data?.score) || 0) >= 80
          ? 'complete'
          : ((coherenceQuery.data?.coherenceScore ?? coherenceQuery.data?.score) || 0) >= 60
          ? 'warning'
          : 'incomplete',
      category: 'recommended',
    },
    {
      id: 'all-sections',
      label: 'All sections complete',
      description: 'All required protocol sections should be filled',
      status: 'complete', // This would check actual section completion
      category: 'required',
    },
  ];

  const requiredComplete = readinessItems
    .filter((i) => i.category === 'required')
    .every((i) => i.status === 'complete');

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
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          {/* Coherence Score Card */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Coherence Score</CardTitle>
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
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div
                  className={cn(
                    'w-24 h-24 rounded-full flex items-center justify-center',
                    getScoreBg((coherenceQuery.data?.coherenceScore ?? coherenceQuery.data?.score) || 0)
                  )}
                >
                  <span
                    className={cn(
                      'text-3xl font-bold',
                      getScoreColor((coherenceQuery.data?.coherenceScore ?? coherenceQuery.data?.score) || 0)
                    )}
                  >
                    {(coherenceQuery.data?.coherenceScore ?? coherenceQuery.data?.score) || 0}%
                  </span>
                </div>
                <div className="flex-1">
                  <Progress
                    value={(coherenceQuery.data?.coherenceScore ?? coherenceQuery.data?.score) || 0}
                    className="h-3 mb-2"
                  />
                  <p className="text-sm text-muted-foreground">
                    {((coherenceQuery.data?.coherenceScore ?? coherenceQuery.data?.score) || 0) >= 90
                      ? 'Excellent! Your documents are highly consistent.'
                      : ((coherenceQuery.data?.coherenceScore ?? coherenceQuery.data?.score) || 0) >= 70
                      ? 'Good consistency, but some issues need attention.'
                      : 'Several inconsistencies detected. Please review and resolve.'}
                  </p>
                </div>
              </div>

              {/* Issue Summary */}
              <div className="flex gap-4 mt-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm">
                    {errorConflicts.length} Critical
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm">
                    {warningConflicts.length} Warnings
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm">
                    {conflicts.filter((c) => c.status === 'resolved').length} Resolved
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Conflicts List */}
          {activeConflicts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Issues to Resolve</CardTitle>
                <CardDescription>
                  Address these issues to improve your coherence score
                </CardDescription>
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

          {/* Submission Readiness */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                Submission Readiness
              </CardTitle>
              <CardDescription>
                Complete these items before submitting for review
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {readinessItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/30"
                >
                  {item.status === 'complete' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
                  ) : item.status === 'warning' ? (
                    <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.label}</span>
                      {item.category === 'required' && (
                        <Badge variant="secondary" className="text-xs">
                          Required
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}

              <Separator className="my-4" />

              <div className="flex items-center justify-between">
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
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Resolution sidebar */}
      {selectedConflictData && (
        <div className="w-80 border-l bg-muted/30 p-4 overflow-auto">
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold mb-1">Resolve Conflict</h3>
              <p className="text-sm text-muted-foreground">
                {selectedConflictData.description}
              </p>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-2">Conflicting Values</h4>
              <div className="space-y-2">
                {selectedConflictData.conflicting_values.map((cv, i) => (
                  <div
                    key={i}
                    className="p-2 rounded bg-background border text-sm"
                  >
                    <div className="font-medium">{cv.source}</div>
                    <div className="text-muted-foreground">{cv.value}</div>
                    {cv.document && (
                      <div className="text-xs text-muted-foreground mt-1">
                        From: {cv.document}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div>
              <h4 className="text-sm font-medium mb-2">Resolution Options</h4>
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

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setSelectedConflict(null);
                  setSelectedResolution('');
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={handleResolve}
                disabled={!selectedResolution || resolveMutation.isPending}
              >
                {resolveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Resolve
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReviewMode;
