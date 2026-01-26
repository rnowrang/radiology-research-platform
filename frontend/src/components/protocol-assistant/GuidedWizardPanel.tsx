import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { protocolAssistantApi } from '@/lib/protocolAssistantApi';
import { useWizardStore } from '@/stores/wizardStore';
import { QuestionCard } from './QuestionCard';
import { WizardProgress } from './WizardProgress';
import { CompletionPanel } from './CompletionPanel';
import { ProtocolPreviewPanel } from './ProtocolPreviewPanel';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import { toast } from '@/hooks/useToast';

interface GuidedWizardPanelProps {
  sessionId: string;
  projectId: string;
  onSwitchToChat: () => void;
}

export function GuidedWizardPanel({ sessionId, projectId, onSwitchToChat }: GuidedWizardPanelProps) {
  const queryClient = useQueryClient();
  const [showPreview, setShowPreview] = useState(false);

  const {
    questions,
    currentIndex,
    answers,  // Subscribe to answers so component re-renders when last answer is submitted
    skippedQuestions,
    initWizard,
    setAnswer,
    skipQuestion,
    goNext,
    goPrevious,
    goToQuestion,
    getCurrentQuestion,
    getProgress,
    isComplete,
  } = useWizardStore();

  // Fetch wizard questions
  const { data: wizardData, isLoading: questionsLoading, error } = useQuery({
    queryKey: ['wizardQuestions', sessionId],
    queryFn: () => protocolAssistantApi.getWizardQuestions(sessionId),
    enabled: !!sessionId,
  });

  // Initialize wizard when data is loaded
  useEffect(() => {
    if (wizardData) {
      initWizard(
        sessionId,
        wizardData.questions,
        wizardData.sections,
        wizardData.total_estimated_minutes
      );
    }
  }, [wizardData, sessionId, initWizard]);

  // Submit answer mutation
  const submitAnswerMutation = useMutation({
    mutationFn: async ({ questionId, answer, source }: { questionId: string; answer: string; source: 'suggested' | 'freetext' | 'extracted' }) => {
      return protocolAssistantApi.submitWizardAnswer(sessionId, questionId, { answer, source });
    },
    onSuccess: (data, variables) => {
      setAnswer(variables.questionId, {
        answer: variables.answer,
        source: variables.source,
        timestamp: new Date().toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ['wizardQuestions', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['protocolSession', projectId] });

      // Auto-advance to next question
      if (data.next_question_id) {
        goNext();
      } else {
        // Check if there are any unanswered questions we missed
        const currentAnswers = useWizardStore.getState().answers;
        const currentSkipped = useWizardStore.getState().skippedQuestions;
        const firstUnansweredIdx = questions.findIndex(
          q => !currentAnswers[q.id] && !currentSkipped.includes(q.id)
        );
        if (firstUnansweredIdx >= 0) {
          goToQuestion(firstUnansweredIdx);
        }
        // If no unanswered questions, component will re-render and show completion panel
      }
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to submit answer',
      });
    },
  });

  // Skip question mutation
  const skipQuestionMutation = useMutation({
    mutationFn: async (questionId: string) => {
      return protocolAssistantApi.skipWizardQuestion(sessionId, questionId);
    },
    onSuccess: (data, questionId) => {
      skipQuestion(questionId);
      queryClient.invalidateQueries({ queryKey: ['wizardQuestions', sessionId] });

      // Auto-advance to next question
      if (data.next_question_id) {
        goNext();
      }
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to skip question',
      });
    },
  });

  const handleAnswer = (answer: string, source: 'suggested' | 'freetext' | 'extracted') => {
    const currentQuestion = getCurrentQuestion();
    if (currentQuestion) {
      submitAnswerMutation.mutate({
        questionId: currentQuestion.id,
        answer,
        source,
      });
    }
  };

  const handleSkip = () => {
    const currentQuestion = getCurrentQuestion();
    if (currentQuestion) {
      skipQuestionMutation.mutate(currentQuestion.id);
    }
  };

  if (questionsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <p className="text-destructive mb-4">Failed to load wizard questions</p>
        <Button variant="outline" onClick={onSwitchToChat}>
          Switch to Chat Mode
        </Button>
      </div>
    );
  }

  const currentQuestion = getCurrentQuestion();
  const progress = getProgress();

  // Compute completion from reactive values - only count answers for CURRENT questions
  const questionIds = new Set(questions.map(q => q.id));
  const answeredCount = Object.keys(answers).filter(id => questionIds.has(id)).length;
  const skippedCount = skippedQuestions.filter(id => questionIds.has(id)).length;
  const totalQuestions = questions.length;
  const complete = totalQuestions > 0 && (answeredCount + skippedCount >= totalQuestions);

  // Show completion panel when done
  if (complete) {
    return (
      <CompletionPanel
        sessionId={sessionId}
        projectId={projectId}
        progress={progress}
        skippedQuestions={skippedQuestions}
        onReviewSkipped={(qId: string) => {
          const idx = questions.findIndex((q) => q.id === qId);
          if (idx >= 0) goToQuestion(idx);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Progress Bar */}
      <WizardProgress
        progress={progress}
        sections={wizardData?.sections || []}
        currentSectionName={currentQuestion?.section}
        onSectionClick={(sectionName: string) => {
          const idx = questions.findIndex((q) => q.section === sectionName);
          if (idx >= 0) goToQuestion(idx);
        }}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Question Card */}
        <div className="flex-1 p-4 overflow-auto">
          {currentQuestion && (
            <QuestionCard
              question={currentQuestion}
              sessionId={sessionId}
              onAnswer={handleAnswer}
              onSkip={handleSkip}
              isSubmitting={submitAnswerMutation.isPending || skipQuestionMutation.isPending}
            />
          )}
        </div>

        {/* Protocol Preview Panel (collapsible) */}
        {showPreview && (
          <div className="w-80 border-l p-4 overflow-auto">
            <ProtocolPreviewPanel sessionId={sessionId} />
          </div>
        )}
      </div>

      {/* Navigation Controls */}
      <div className="flex items-center justify-between p-4 border-t bg-background">
        <Button
          variant="outline"
          size="sm"
          onClick={goPrevious}
          disabled={currentIndex === 0 || submitAnswerMutation.isPending}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Previous
        </Button>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? 'Hide' : 'Show'} Preview
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            disabled={submitAnswerMutation.isPending || skipQuestionMutation.isPending}
          >
            <SkipForward className="h-4 w-4 mr-1" />
            Skip
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={goNext}
            disabled={currentIndex >= questions.length - 1 || submitAnswerMutation.isPending}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
