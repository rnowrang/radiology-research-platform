/**
 * Intelligence Panel - Unified AI Assistant Container
 *
 * The main container for the Research Intelligence Assistant that provides:
 * - Mode switching (Chat, Guided, Document, Review)
 * - Shared context across modes
 * - Progress tracking
 * - Real-time updates
 */

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useIntelligenceStore, IntelligenceMode } from '@/stores/intelligenceStore';
import * as intelligenceApi from '@/lib/intelligenceApi';
import { ModeSelector } from './ModeSelector';
import { ChatMode } from './ChatMode';
import { GuidedMode } from './GuidedMode';
import { DocumentMode } from './DocumentMode';
import { ReviewMode } from './ReviewMode';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle } from 'lucide-react';

interface IntelligencePanelProps {
  projectId: string;
  initialMode?: IntelligenceMode;
  onComplete?: () => void;
}

export function IntelligencePanel({
  projectId,
  initialMode = 'guided',
  onComplete,
}: IntelligencePanelProps) {
  const [sessionReady, setSessionReady] = useState(false);

  // Store state
  const {
    sessionId,
    currentMode,
    setProjectContext,
    setMode,
    switchMode,
    initQuestions,
    setCoherenceStatus,
    error,
  } = useIntelligenceStore();

  // Initialize project context
  useEffect(() => {
    setProjectContext(projectId);
    if (initialMode) {
      setMode(initialMode);
    }
  }, [projectId, initialMode, setProjectContext, setMode]);

  // Get or create session
  const sessionQuery = useQuery({
    queryKey: ['intelligence-session', projectId],
    queryFn: () => intelligenceApi.getOrCreateSession(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Update store with session
  useEffect(() => {
    if (sessionQuery.data?.sessionId) {
      setProjectContext(projectId, sessionQuery.data.sessionId);
      setSessionReady(true);
    }
  }, [sessionQuery.data, projectId, setProjectContext]);

  // Fetch questionnaire
  const questionnaireQuery = useQuery({
    queryKey: ['questionnaire', projectId],
    queryFn: () => intelligenceApi.getQuestionnaire(projectId),
    enabled: !!projectId && sessionReady,
  });

  // Initialize questions when questionnaire loads
  useEffect(() => {
    if (questionnaireQuery.data) {
      const { sections, estimatedMinutes } = questionnaireQuery.data;

      // Flatten questions from sections
      const allQuestions = sections.flatMap((section) =>
        section.questions.map((q) => ({
          ...q,
          section: section.id,
        }))
      );

      // Create section info
      const sectionInfo = sections.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        questionCount: s.questions.length,
        answeredCount: 0,
        skippedCount: 0,
      }));

      initQuestions(allQuestions, sectionInfo, estimatedMinutes);
    }
  }, [questionnaireQuery.data, initQuestions]);

  // Fetch coherence status
  const coherenceQuery = useQuery({
    queryKey: ['coherence-status', projectId],
    queryFn: () => intelligenceApi.getCoherenceStatus(projectId),
    enabled: !!projectId && sessionReady,
    refetchInterval: 60000, // Refresh every minute
  });

  // Update store with coherence status
  useEffect(() => {
    if (coherenceQuery.data) {
      const topIssues = coherenceQuery.data.topIssues || [];
      const issues = topIssues.map((desc: string, i: number) => ({
        id: `issue_${i}`,
        ruleId: 'unknown',
        ruleName: 'Issue',
        severity: 'warning' as const,
        factKey: 'unknown',
        description: desc,
        values: {},
        sources: [],
      }));

      setCoherenceStatus(
        coherenceQuery.data.coherenceScore ?? 100,
        issues,
        coherenceQuery.data.lastCheckedAt || new Date().toISOString()
      );
    }
  }, [coherenceQuery.data, setCoherenceStatus]);

  // Subscribe to real-time events
  useEffect(() => {
    if (!projectId || !sessionReady) return;

    let eventSource: EventSource | null = null;

    try {
      eventSource = intelligenceApi.subscribeToProjectEvents(
        projectId,
        (event) => {
          // Handle real-time updates
          if (event.type === 'coherence.conflict_detected') {
            coherenceQuery.refetch();
          } else if (event.type === 'fact.created' || event.type === 'knowledge_base.updated') {
            questionnaireQuery.refetch();
          }
        },
        (error) => {
          console.warn('SSE connection error:', error);
        }
      );
    } catch (err) {
      console.warn('Failed to establish SSE connection:', err);
    }

    return () => {
      eventSource?.close();
    };
  }, [projectId, sessionReady, coherenceQuery, questionnaireQuery]);

  // Handle mode switching
  const handleModeChange = (mode: IntelligenceMode) => {
    switchMode(mode);
  };

  // Loading state
  if (sessionQuery.isLoading || !sessionReady) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Initializing assistant...</span>
      </div>
    );
  }

  // Error state
  if (sessionQuery.error || error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {error || 'Failed to initialize the assistant. Please try again.'}
        </AlertDescription>
      </Alert>
    );
  }

  // All modes have their own integrated sidebars, so use a simple layout
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Mode Selector Header */}
      <div className="border-b px-4 py-2 flex items-center justify-end bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">
        <ModeSelector currentMode={currentMode} onModeChange={handleModeChange} />
      </div>

      {/* Mode Content - fills remaining space */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {currentMode === 'guided' && (
          <GuidedMode
            projectId={projectId}
            sessionId={sessionId || ''}
            onComplete={onComplete}
            onSwitchToChat={() => handleModeChange('chat')}
          />
        )}

        {currentMode === 'chat' && sessionId && (
          <ChatMode
            projectId={projectId}
            sessionId={sessionId}
            onSwitchToGuided={() => handleModeChange('guided')}
          />
        )}

        {currentMode === 'document' && (
          <DocumentMode
            projectId={projectId}
            sessionId={sessionId || ''}
          />
        )}

        {currentMode === 'review' && (
          <ReviewMode
            projectId={projectId}
            coherenceStatus={coherenceQuery.data}
            onRefresh={() => coherenceQuery.refetch()}
          />
        )}
      </div>
    </div>
  );
}

export default IntelligencePanel;
