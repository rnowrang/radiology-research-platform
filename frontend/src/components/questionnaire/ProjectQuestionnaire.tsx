import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { protocolAssistantApi } from '@/lib/protocolAssistantApi';
import { useQuestionnaireStore } from '@/stores/questionnaireStore';
import { QuestionnaireSidebar } from './QuestionnaireSidebar';
import { QuestionnaireQuestionCard } from './QuestionnaireQuestionCard';
import { QuestionnaireCompletionPanel } from './QuestionnaireCompletionPanel';
import { DocumentUploadPanel } from './DocumentUploadPanel';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, ChevronLeft, ChevronRight, SkipForward, RotateCcw } from 'lucide-react';
import { toast } from '@/hooks/useToast';

interface ProjectQuestionnaireProps {
  projectId: string;
  onComplete?: () => void;
}

export function ProjectQuestionnaire({ projectId, onComplete }: ProjectQuestionnaireProps) {
  const queryClient = useQueryClient();

  const {
    questions,
    sections,
    currentIndex,
    skippedQuestions,
    initQuestionnaire,
    setAnswer,
    skipQuestion,
    goNext,
    goPrevious,
    goToQuestion,
    goToSection,
    getCurrentQuestion,
    getProgress,
    isComplete,
    resetQuestionnaire,
  } = useQuestionnaireStore();

  // Fetch questionnaire data
  const { data: questionnaireData, isLoading, error, refetch } = useQuery({
    queryKey: ['projectQuestionnaire', projectId],
    queryFn: () => protocolAssistantApi.getProjectQuestionnaire(projectId),
    enabled: !!projectId,
  });

  // Initialize store when data loads
  useEffect(() => {
    if (questionnaireData) {
      // Extract all questions from sections into a flat array
      const allQuestions = questionnaireData.sections?.flatMap(section =>
        section.questions || []
      ) || [];

      initQuestionnaire(
        projectId,
        allQuestions,
        questionnaireData.sections || [],
        questionnaireData.estimated_minutes || 15,
        questionnaireData.project_type || null
      );
    }
  }, [questionnaireData, projectId, initQuestionnaire]);

  // Submit answer mutation
  const submitAnswerMutation = useMutation({
    mutationFn: async ({
      questionId,
      answer,
      source,
    }: {
      questionId: string;
      answer: string | number | boolean | string[];
      source: 'user' | 'suggested';
    }) => {
      return protocolAssistantApi.submitQuestionnaireAnswer(projectId, questionId, {
        answer,
        // Map frontend source to backend FactSource enum values
        source: source === 'suggested' ? 'extracted' : 'wizard',
      });
    },
    onSuccess: (data, variables) => {
      setAnswer(variables.questionId, {
        answer: variables.answer,
        source: variables.source,
        timestamp: new Date().toISOString(),
      });

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['projectQuestionnaire', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectKnowledge', projectId] });

      // Auto-advance to next question
      if (data.next_question_id) {
        const nextIdx = questions.findIndex((q) => q.id === data.next_question_id);
        if (nextIdx >= 0) {
          goToQuestion(nextIdx);
        } else {
          goNext();
        }
      } else {
        // Check if there are any unanswered questions
        const currentAnswers = useQuestionnaireStore.getState().answers;
        const currentSkipped = useQuestionnaireStore.getState().skippedQuestions;
        const firstUnansweredIdx = questions.findIndex(
          (q) => !currentAnswers[q.id] && !currentSkipped.includes(q.id)
        );
        if (firstUnansweredIdx >= 0) {
          goToQuestion(firstUnansweredIdx);
        }
      }

      toast({
        title: 'Answer saved',
        description: 'Your answer has been recorded.',
      });
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
      return protocolAssistantApi.skipQuestionnaireQuestion(projectId, questionId);
    },
    onSuccess: (_data, questionId) => {
      skipQuestion(questionId);
      queryClient.invalidateQueries({ queryKey: ['projectQuestionnaire', projectId] });
      goNext();
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to skip question',
      });
    },
  });

  // Reset questionnaire mutation
  const resetMutation = useMutation({
    mutationFn: async () => {
      return protocolAssistantApi.resetQuestionnaire(projectId);
    },
    onSuccess: () => {
      resetQuestionnaire();
      queryClient.invalidateQueries({ queryKey: ['projectQuestionnaire', projectId] });
      refetch();
      toast({
        title: 'Questionnaire reset',
        description: 'All answers have been cleared.',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to reset questionnaire',
      });
    },
  });

  const handleAnswer = (answer: string | number | boolean | string[], source: 'user' | 'suggested') => {
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
    if (currentQuestion && currentQuestion.priority !== 'required') {
      skipQuestionMutation.mutate(currentQuestion.id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading questionnaire...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <p className="text-destructive mb-4">Failed to load questionnaire</p>
        <Button variant="outline" onClick={() => refetch()}>
          Try Again
        </Button>
      </div>
    );
  }

  const currentQuestion = getCurrentQuestion();
  const progress = getProgress();
  const complete = isComplete();

  // Show completion panel when done
  if (complete) {
    return (
      <QuestionnaireCompletionPanel
        projectId={projectId}
        progress={progress}
        skippedQuestions={skippedQuestions}
        onReviewSkipped={(qId) => {
          const idx = questions.findIndex((q) => q.id === qId);
          if (idx >= 0) goToQuestion(idx);
        }}
        onComplete={onComplete}
      />
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <QuestionnaireSidebar
        sections={sections}
        progress={progress}
        currentSectionKey={currentQuestion?.section}
        onSectionClick={goToSection}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Progress Bar */}
        <div className="p-4 border-b bg-background">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Question {currentIndex + 1} of {questions.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              className="text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </div>
          <Progress value={(currentIndex / questions.length) * 100} className="h-1" />
        </div>

        {/* Question Area */}
        <div className="flex-1 p-6 overflow-auto">
          {/* Document Upload Panel - compact and elegant */}
          <div className="mb-6">
            <DocumentUploadPanel
              projectId={projectId}
              onUploadComplete={() => refetch()}
            />
          </div>

          {currentQuestion && (
            <QuestionnaireQuestionCard
              question={currentQuestion}
              onAnswer={handleAnswer}
              onSkip={currentQuestion.priority !== 'required' ? handleSkip : undefined}
              isSubmitting={submitAnswerMutation.isPending || skipQuestionMutation.isPending}
            />
          )}
        </div>

        {/* Navigation */}
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

          <div className="flex items-center gap-4">
            {currentQuestion?.priority !== 'required' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                disabled={submitAnswerMutation.isPending || skipQuestionMutation.isPending}
              >
                <SkipForward className="h-4 w-4 mr-1" />
                Skip
              </Button>
            )}
          </div>

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
