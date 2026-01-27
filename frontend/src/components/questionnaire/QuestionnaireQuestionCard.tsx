import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AnswerInput } from './AnswerInput';
import { SuggestionBadge } from './SuggestionBadge';
import { HelpCircle, Sparkles, Check, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QuestionnaireQuestion } from '@/lib/protocolAssistantApi';

interface QuestionnaireQuestionCardProps {
  question: QuestionnaireQuestion;
  onAnswer: (answer: string | number | boolean | string[], source: 'user' | 'suggested') => void;
  onSkip?: () => void;
  isSubmitting: boolean;
}

const priorityStyles: Record<string, { badge: string; label: string }> = {
  required: { badge: 'bg-red-100 text-red-800 border-red-200', label: 'Required' },
  recommended: { badge: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'Recommended' },
  optional: { badge: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Optional' },
};

export function QuestionnaireQuestionCard({
  question,
  onAnswer,
  onSkip,
  isSubmitting,
}: QuestionnaireQuestionCardProps) {
  const [showSuggestion, setShowSuggestion] = useState(true);
  const [initialValue, setInitialValue] = useState<string | number | boolean | string[] | undefined>(undefined);

  // Reset state when question changes
  useEffect(() => {
    setShowSuggestion(true);
    setInitialValue(undefined);
  }, [question.id]);

  const handleUseSuggestion = () => {
    if (question.suggested_answer) {
      onAnswer(question.suggested_answer, 'suggested');
    }
  };

  const handleSubmit = (value: string | number | boolean | string[]) => {
    onAnswer(value, 'user');
  };

  const priorityConfig = priorityStyles[question.priority] || priorityStyles.optional;

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="pb-3">
        {/* Section Badge and Priority */}
        <div className="flex items-center justify-between mb-2">
          <Badge variant="outline" className="capitalize">
            {question.section.replace(/_/g, ' ')}
          </Badge>
          <Badge
            variant="outline"
            className={cn('capitalize', priorityConfig.badge)}
          >
            {priorityConfig.label}
          </Badge>
        </div>

        {/* Question Text */}
        <h3 className="text-lg font-semibold leading-snug">{question.question}</h3>

        {/* Why Needed Tooltip */}
        {question.why_needed && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="flex items-center gap-1 text-sm text-muted-foreground mt-2 hover:text-foreground transition-colors">
                  <HelpCircle className="h-4 w-4" />
                  Why is this needed?
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p>{question.why_needed}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* AI Suggestion Banner */}
        {question.suggested_answer && showSuggestion && (
          <Alert className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
            <Sparkles className="h-4 w-4 text-purple-600" />
            <AlertDescription className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-purple-900">Suggested Answer</span>
                <SuggestionBadge
                  source={question.suggestion_source?.includes('document') ? 'document' : 'ai'}
                  confidence={question.suggestion_confidence}
                />
              </div>
              <p className="text-sm text-purple-800 bg-white/50 p-2 rounded border border-purple-100">
                {question.suggested_answer}
              </p>
              {question.suggestion_source && (
                <p className="text-xs text-purple-600 flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {question.suggestion_source}
                </p>
              )}
              <div className="flex gap-2 mt-1">
                <Button
                  size="sm"
                  onClick={handleUseSuggestion}
                  disabled={isSubmitting}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Check className="h-3 w-3 mr-1" />
                  Use This Answer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setInitialValue(question.suggested_answer);
                    setShowSuggestion(false);
                  }}
                  disabled={isSubmitting}
                >
                  Edit
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Answer Input */}
        <div>
          {!question.suggested_answer || !showSuggestion ? (
            <>
              <label className="text-sm text-muted-foreground mb-2 block">
                {question.suggested_answer ? 'Edit your answer:' : 'Your answer:'}
              </label>
              <AnswerInput
                type={question.answer_type}
                options={question.options}
                initialValue={initialValue}
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
              />
            </>
          ) : null}
        </div>
      </CardContent>

      <CardFooter className="flex justify-between items-center text-xs text-muted-foreground border-t pt-4">
        <div className="flex items-center gap-1">
          <span>Used in:</span>
          <span className="font-medium">{question.used_in_forms.join(', ')}</span>
        </div>
        {onSkip && question.priority !== 'required' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            disabled={isSubmitting}
            className="text-muted-foreground hover:text-foreground"
          >
            Skip this question
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
