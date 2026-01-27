/**
 * Project Health Dashboard - Overview of project coherence and completeness
 *
 * Provides:
 * - Overall coherence score with visual indicator
 * - Conflict summary with quick resolution links
 * - Knowledge base completeness meter
 * - Quick action buttons for common issues
 * - Real-time updates via SSE
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  FileText,
  Database,
  Shield,
  Loader2,
} from 'lucide-react';
import * as intelligenceApi from '@/lib/intelligenceApi';
import { useEventStore } from '@/stores/eventStore';

interface ProjectHealthDashboardProps {
  projectId: string;
  className?: string;
  compact?: boolean;
}

export function ProjectHealthDashboard({
  projectId,
  className,
  compact = false,
}: ProjectHealthDashboardProps) {
  const { connect, disconnect, isConnected, addCallback, removeCallback } = useEventStore();

  // Fetch coherence status
  const coherenceQuery = useQuery({
    queryKey: ['coherence-status', projectId],
    queryFn: () => intelligenceApi.getCoherenceStatus(projectId),
    enabled: !!projectId,
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch knowledge stats
  const knowledgeQuery = useQuery({
    queryKey: ['knowledge-stats', projectId],
    queryFn: () => intelligenceApi.getKnowledgeStats(projectId),
    enabled: !!projectId,
    refetchInterval: 60000,
  });

  // Connect to real-time events
  useEffect(() => {
    if (projectId) {
      connect(projectId);

      const callbackId = addCallback(
        ['coherence.score_changed', 'conflict.detected', 'conflict.resolved', 'fact.created'],
        () => {
          // Refetch on relevant events
          coherenceQuery.refetch();
          knowledgeQuery.refetch();
        }
      );

      return () => {
        removeCallback(callbackId);
      };
    }
  }, [projectId, connect, addCallback, removeCallback]);

  const coherenceScore = coherenceQuery.data?.coherenceScore ?? 0;
  const totalConflicts = coherenceQuery.data?.totalConflicts ?? 0;
  const errorConflicts = coherenceQuery.data?.conflictsError ?? 0;
  const warningConflicts = coherenceQuery.data?.conflictsWarning ?? 0;
  const factsCount = knowledgeQuery.data?.factsCount ?? 0;
  const completionPercentage = knowledgeQuery.data?.completionPercentage ?? 0;

  const scoreColor =
    coherenceScore >= 90
      ? 'text-green-600'
      : coherenceScore >= 70
      ? 'text-yellow-600'
      : 'text-red-600';

  const scoreBg =
    coherenceScore >= 90
      ? 'bg-green-100'
      : coherenceScore >= 70
      ? 'bg-yellow-100'
      : 'bg-red-100';

  const scoreStatus =
    coherenceScore >= 90
      ? 'Excellent'
      : coherenceScore >= 70
      ? 'Good'
      : coherenceScore >= 50
      ? 'Needs Attention'
      : 'Critical';

  if (compact) {
    return (
      <Card className={cn('overflow-hidden', className)}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Score Circle */}
              <div
                className={cn(
                  'w-14 h-14 rounded-full flex items-center justify-center',
                  scoreBg
                )}
              >
                <span className={cn('text-xl font-bold', scoreColor)}>
                  {coherenceScore}%
                </span>
              </div>

              {/* Status */}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">Coherence</span>
                  {isConnected && (
                    <span className="w-2 h-2 rounded-full bg-green-500" title="Live" />
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {errorConflicts > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
                      <XCircle className="h-3 w-3" />
                      {errorConflicts}
                    </span>
                  )}
                  {warningConflicts > 0 && (
                    <span className="flex items-center gap-1 text-yellow-600">
                      <AlertTriangle className="h-3 w-3" />
                      {warningConflicts}
                    </span>
                  )}
                  {totalConflicts === 0 && (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      All good
                    </span>
                  )}
                </div>
              </div>
            </div>

            <Button variant="outline" size="sm" asChild>
              <Link to={`/projects/${projectId}/intelligence?mode=review`}>
                Review
                <ExternalLink className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Project Health
            </CardTitle>
            <CardDescription>
              Coherence and completeness overview
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <Badge variant="outline" className="text-xs">
                <span className="w-2 h-2 rounded-full bg-green-500 mr-1" />
                Live
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                coherenceQuery.refetch();
                knowledgeQuery.refetch();
              }}
              disabled={coherenceQuery.isFetching}
            >
              {coherenceQuery.isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Coherence Score */}
        <div className="flex items-start gap-6">
          <div
            className={cn(
              'w-24 h-24 rounded-full flex flex-col items-center justify-center',
              scoreBg
            )}
          >
            <span className={cn('text-3xl font-bold', scoreColor)}>
              {coherenceScore}%
            </span>
            <span className={cn('text-xs font-medium', scoreColor)}>{scoreStatus}</span>
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Document Consistency</span>
                <span className="text-sm text-muted-foreground">
                  {coherenceQuery.data?.rulesPassed ?? 0}/
                  {coherenceQuery.data?.totalRulesChecked ?? 0} rules passed
                </span>
              </div>
              <Progress value={coherenceScore} className="h-2" />
            </div>

            {/* Issue Summary */}
            <div className="flex items-center gap-4 text-sm">
              {errorConflicts > 0 && (
                <div className="flex items-center gap-1 text-red-600">
                  <XCircle className="h-4 w-4" />
                  <span>{errorConflicts} critical</span>
                </div>
              )}
              {warningConflicts > 0 && (
                <div className="flex items-center gap-1 text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{warningConflicts} warnings</span>
                </div>
              )}
              {totalConflicts === 0 && (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>No issues detected</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Knowledge Base Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Database className="h-4 w-4" />
              Knowledge Base
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{factsCount}</span>
              <span className="text-sm text-muted-foreground">facts stored</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              Completeness
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">{completionPercentage}%</span>
              <span className="text-sm text-muted-foreground">complete</span>
            </div>
          </div>
        </div>

        <Separator />

        {/* Quick Actions */}
        <div className="space-y-2">
          <span className="text-sm font-medium">Quick Actions</span>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/projects/${projectId}/intelligence?mode=review`}>
                <Shield className="h-4 w-4 mr-2" />
                Review Issues
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/projects/${projectId}/intelligence?mode=guided`}>
                <Sparkles className="h-4 w-4 mr-2" />
                Continue Questionnaire
              </Link>
            </Button>
          </div>
        </div>

        {/* Top Issues Preview */}
        {coherenceQuery.data?.topIssues && coherenceQuery.data.topIssues.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <span className="text-sm font-medium">Top Issues</span>
              <div className="space-y-2">
                {coherenceQuery.data.topIssues.slice(0, 3).map((issue, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 p-2 rounded-lg bg-muted/50 text-sm"
                  >
                    <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                    <span>{issue}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Submission Readiness */}
        <div
          className={cn(
            'p-3 rounded-lg flex items-center justify-between',
            coherenceQuery.data?.readyForSubmission
              ? 'bg-green-50 border border-green-200'
              : 'bg-yellow-50 border border-yellow-200'
          )}
        >
          <div className="flex items-center gap-2">
            {coherenceQuery.data?.readyForSubmission ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-green-800">
                  Ready for submission
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800">
                  {coherenceQuery.data?.hasBlockingIssues
                    ? 'Blocking issues need resolution'
                    : 'Review recommended before submission'}
                </span>
              </>
            )}
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/projects/${projectId}/intelligence?mode=review`}>
              Details
              <ExternalLink className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default ProjectHealthDashboard;
