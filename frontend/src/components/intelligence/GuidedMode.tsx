/**
 * Guided Mode - Structured questionnaire interface
 *
 * Provides:
 * - One question at a time display
 * - Progress tracking
 * - Suggestions from knowledge base
 * - Skip and navigation functionality
 * - Completion panel
 */

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useIntelligenceStore } from '@/stores/intelligenceStore';
import * as intelligenceApi from '@/lib/intelligenceApi';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  SkipForward,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Info,
  Loader2,
  FileText,
  PartyPopper,
} from 'lucide-react';

interface GuidedModeProps {
  projectId: string;
  sessionId: string;
  onComplete?: () => void;
  onSwitchToChat?: () => void;
}

export function GuidedMode({
  projectId,
  sessionId,
  onComplete,
  onSwitchToChat,
}: GuidedModeProps) {
  const queryClient = useQueryClient();

  const {
    questions,
    answers,
    skippedQuestions,
    currentQuestionIndex,
    getCurrentQuestion,
    getProgress,
    setAnswer,
    skipQuestion,
    goNext,
    goPrevious,
    isComplete,
    canComplete,
    generatedDocuments,
    addGeneratedDocument,
  } = useIntelligenceStore();

  const [inputValue, setInputValue] = useState<string | number | boolean | string[]>('');
  const [suggestions, setSuggestions] = useState<
    Array<{ value: string; confidence: number; source: string }>
  >([]);

  const currentQuestion = getCurrentQuestion();
  const progress = getProgress();
  const isAnswered = currentQuestion && answers[currentQuestion.id];
  const isSkipped = currentQuestion && skippedQuestions.includes(currentQuestion.id);

  // Load existing answer
  useEffect(() => {
    if (currentQuestion) {
      const existing = answers[currentQuestion.id];
      if (existing) {
        setInputValue(existing.value);
      } else if (currentQuestion.suggestedAnswer) {
        // Don't auto-fill, but show as suggestion
        setInputValue('');
      } else {
        setInputValue('');
      }
    }
  }, [currentQuestion?.id, answers]);

  // Fetch suggestions for current question
  useEffect(() => {
    if (currentQuestion && sessionId) {
      intelligenceApi
        .getQuestionSuggestions(sessionId, currentQuestion.id)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }
  }, [currentQuestion?.id, sessionId]);

  // Submit answer mutation
  const submitMutation = useMutation({
    mutationFn: async ({
      questionId,
      value,
      source,
    }: {
      questionId: string;
      value: string | number | boolean | string[];
      source: 'user' | 'suggested';
    }) => {
      // Update local state immediately
      setAnswer(questionId, value, source);

      // Submit to backend
      return intelligenceApi.submitAnswer(projectId, questionId, value, source);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questionnaire', projectId] });
      goNext();
    },
  });

  // Skip question mutation
  const skipMutation = useMutation({
    mutationFn: async (questionId: string) => {
      skipQuestion(questionId);
      return intelligenceApi.skipQuestion(projectId, questionId);
    },
    onSuccess: () => {
      goNext();
    },
  });

  // Generate document mutation
  const generateMutation = useMutation({
    mutationFn: (
      docType: 'abstract' | 'consent' | 'protocol' | 'recruitment' | 'data_management'
    ) => intelligenceApi.generateDocument(sessionId, docType),
    onSuccess: (doc) => {
      addGeneratedDocument({
        id: doc.id,
        type: doc.type,
        name: doc.name,
        generatedAt: doc.generatedAt,
        downloadUrl: doc.downloadUrl,
      });
    },
  });

  const handleSubmit = () => {
    if (!currentQuestion || !inputValue) return;

    submitMutation.mutate({
      questionId: currentQuestion.id,
      value: inputValue,
      source: 'user',
    });
  };

  const handleUseSuggestion = (value: string) => {
    if (!currentQuestion) return;

    setInputValue(value);
    submitMutation.mutate({
      questionId: currentQuestion.id,
      value,
      source: 'suggested',
    });
  };

  const handleSkip = () => {
    if (!currentQuestion) return;
    skipMutation.mutate(currentQuestion.id);
  };

  // Completion state
  if (isComplete()) {
    return (
      <CompletionPanel
        progress={progress}
        generatedDocuments={generatedDocuments}
        onGenerateDocument={(type) => generateMutation.mutate(type)}
        isGenerating={generateMutation.isPending}
        onComplete={onComplete}
      />
    );
  }

  // No questions state
  if (!currentQuestion) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading questions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Progress bar */}
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">
            Question {currentQuestionIndex + 1} of {questions.length}
          </span>
          <span className="text-sm font-medium">{progress.completionPercentage}% complete</span>
        </div>
        <Progress value={progress.completionPercentage} className="h-2" />
      </div>

      {/* Question card */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs">
                      {currentQuestion.section}
                    </Badge>
                    <PriorityBadge priority={currentQuestion.priority} />
                    {isAnswered && (
                      <Badge variant="secondary" className="text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Answered
                      </Badge>
                    )}
                    {isSkipped && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        <SkipForward className="h-3 w-3 mr-1" />
                        Skipped
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg">{currentQuestion.question}</CardTitle>
                </div>
              </div>

              {/* Rationale */}
              {(currentQuestion.rationale || currentQuestion.whyNeeded) && (
                <p className="text-sm text-muted-foreground mt-2">
                  <Info className="h-4 w-4 inline mr-1" />
                  {currentQuestion.rationale || currentQuestion.whyNeeded}
                </p>
              )}

              {/* Forms this helps fill */}
              {currentQuestion.usedInForms && currentQuestion.usedInForms.length > 0 && (
                <div className="flex items-center gap-2 mt-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Used in: {currentQuestion.usedInForms.join(', ')}
                  </span>
                </div>
              )}
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Suggestions */}
              {(currentQuestion.suggestedAnswer || suggestions.length > 0) && (
                <Alert>
                  <Sparkles className="h-4 w-4" />
                  <AlertDescription>
                    <div className="font-medium mb-2">Suggested answers:</div>
                    <div className="space-y-2">
                      {currentQuestion.suggestedAnswer && (
                        <button
                          onClick={() =>
                            handleUseSuggestion(currentQuestion.suggestedAnswer!)
                          }
                          className="block w-full text-left p-2 rounded hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span>{currentQuestion.suggestedAnswer}</span>
                            {currentQuestion.suggestedAnswerConfidence && (
                              <Badge variant="secondary" className="text-xs">
                                {Math.round(
                                  currentQuestion.suggestedAnswerConfidence * 100
                                )}
                                % confident
                              </Badge>
                            )}
                          </div>
                          {currentQuestion.suggestedAnswerSource && (
                            <span className="text-xs text-muted-foreground">
                              Source: {currentQuestion.suggestedAnswerSource}
                            </span>
                          )}
                        </button>
                      )}
                      {suggestions.map((suggestion, i) => (
                        <button
                          key={i}
                          onClick={() => handleUseSuggestion(suggestion.value)}
                          className="block w-full text-left p-2 rounded hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span>{suggestion.value}</span>
                            <Badge variant="secondary" className="text-xs">
                              {Math.round(suggestion.confidence * 100)}%
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            Source: {suggestion.source}
                          </span>
                        </button>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Input based on answer type */}
              <AnswerInput
                type={currentQuestion.answerType}
                options={currentQuestion.options}
                value={inputValue}
                onChange={setInputValue}
                disabled={submitMutation.isPending}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Navigation */}
      <div className="border-t px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Button
            variant="outline"
            onClick={goPrevious}
            disabled={currentQuestionIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={handleSkip}
              disabled={skipMutation.isPending}
            >
              <SkipForward className="h-4 w-4 mr-2" />
              Skip
            </Button>

            <Button
              onClick={handleSubmit}
              disabled={!inputValue || submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ChevronRight className="h-4 w-4 mr-2" />
              )}
              {isAnswered ? 'Update & Next' : 'Save & Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function PriorityBadge({ priority }: { priority: string }) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'outline'; label: string }> = {
    high: { variant: 'default', label: 'Required' },
    required: { variant: 'default', label: 'Required' },
    medium: { variant: 'secondary', label: 'Recommended' },
    recommended: { variant: 'secondary', label: 'Recommended' },
    low: { variant: 'outline', label: 'Optional' },
    optional: { variant: 'outline', label: 'Optional' },
  };

  const config = variants[priority] || variants.optional;

  return (
    <Badge variant={config.variant} className="text-xs">
      {config.label}
    </Badge>
  );
}

function AnswerInput({
  type,
  options,
  value,
  onChange,
  disabled,
}: {
  type: string;
  options?: string[];
  value: string | number | boolean | string[];
  onChange: (value: string | number | boolean | string[]) => void;
  disabled?: boolean;
}) {
  switch (type) {
    case 'text':
      return (
        <Textarea
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter your answer..."
          className="min-h-[100px]"
          disabled={disabled}
        />
      );

    case 'number':
      return (
        <Input
          type="number"
          value={value as number}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          placeholder="Enter a number..."
          disabled={disabled}
        />
      );

    case 'select':
      return (
        <Select
          value={value as string}
          onValueChange={onChange}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select an option..." />
          </SelectTrigger>
          <SelectContent>
            {options?.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'multiselect':
      return (
        <div className="space-y-2">
          {options?.map((option) => (
            <label key={option} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={(value as string[])?.includes(option)}
                onCheckedChange={(checked) => {
                  const current = (value as string[]) || [];
                  if (checked) {
                    onChange([...current, option]);
                  } else {
                    onChange(current.filter((v) => v !== option));
                  }
                }}
                disabled={disabled}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      );

    case 'boolean':
      return (
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={value === true}
              onChange={() => onChange(true)}
              disabled={disabled}
            />
            <span>Yes</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={value === false}
              onChange={() => onChange(false)}
              disabled={disabled}
            />
            <span>No</span>
          </label>
        </div>
      );

    case 'date':
      return (
        <Input
          type="date"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      );

    default:
      return (
        <Textarea
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Enter your answer..."
          className="min-h-[100px]"
          disabled={disabled}
        />
      );
  }
}

function CompletionPanel({
  progress,
  generatedDocuments,
  onGenerateDocument,
  isGenerating,
  onComplete,
}: {
  progress: ReturnType<typeof useIntelligenceStore.getState>['getProgress'];
  generatedDocuments: Array<{ id: string; type: string; name: string; downloadUrl?: string }>;
  onGenerateDocument: (
    type: 'abstract' | 'consent' | 'protocol' | 'recruitment' | 'data_management'
  ) => void;
  isGenerating: boolean;
  onComplete?: () => void;
}) {
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
            <PartyPopper className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Questionnaire Complete!</h2>
          <p className="text-muted-foreground">
            You've answered {progress.answered} questions. Your knowledge base is ready
            to help fill forms and generate documents.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-green-600">{progress.answered}</div>
              <div className="text-sm text-muted-foreground">Answered</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-muted-foreground">
                {progress.skipped}
              </div>
              <div className="text-sm text-muted-foreground">Skipped</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-primary">
                {progress.completionPercentage}%
              </div>
              <div className="text-sm text-muted-foreground">Complete</div>
            </CardContent>
          </Card>
        </div>

        {/* Generate Documents */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Generate Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {[
                { type: 'abstract' as const, label: 'Abstract' },
                { type: 'consent' as const, label: 'Consent Form' },
                { type: 'protocol' as const, label: 'Protocol' },
                { type: 'recruitment' as const, label: 'Recruitment' },
                { type: 'data_management' as const, label: 'Data Management' },
              ].map(({ type, label }) => {
                const generated = generatedDocuments.find((d) => d.type === type);
                return (
                  <Button
                    key={type}
                    variant={generated ? 'secondary' : 'outline'}
                    onClick={() => onGenerateDocument(type)}
                    disabled={isGenerating}
                    className="justify-start"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : generated ? (
                      <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                    ) : (
                      <FileText className="h-4 w-4 mr-2" />
                    )}
                    {label}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        {onComplete && (
          <div className="flex justify-center">
            <Button size="lg" onClick={onComplete}>
              Continue to Forms
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default GuidedMode;
