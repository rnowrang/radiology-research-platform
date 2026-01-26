import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { protocolAssistantApi, EnhancedGapQuestion, SuggestedAnswer } from '@/lib/protocolAssistantApi';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AnswerChips } from './AnswerChips';
import { ConfidenceIndicator } from './ConfidenceIndicator';
import { FormFieldPreview } from './FormFieldPreview';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuestionCardProps {
  question: EnhancedGapQuestion;
  sessionId: string;
  onAnswer: (answer: string, source: 'suggested' | 'freetext' | 'extracted') => void;
  onSkip?: () => void;
  isSubmitting: boolean;
}

const priorityColors: Record<string, string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
};

const sectionIcons: Record<string, string> = {
  methodology: '🔬',
  risks: '⚠️',
  population: '👥',
  objectives: '🎯',
  privacy: '🔒',
  study_info: '📝',
  other: '📋',
};

export function QuestionCard({ question, sessionId, onAnswer, isSubmitting }: QuestionCardProps) {
  const [freeTextValue, setFreeTextValue] = useState('');
  const [selectedChip, setSelectedChip] = useState<string | null>(null);

  // Fetch suggestions for this question
  const { data: suggestionsData, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['questionSuggestions', sessionId, question.id],
    queryFn: () => protocolAssistantApi.getQuestionSuggestions(sessionId, question.id),
    enabled: !!sessionId && !!question.id,
  });

  // Reset state when question changes
  useEffect(() => {
    setFreeTextValue('');
    setSelectedChip(null);
  }, [question.id]);

  const handleChipSelect = (suggestion: SuggestedAnswer) => {
    setSelectedChip(suggestion.id);
    setFreeTextValue(suggestion.text);
  };

  const handleSubmit = () => {
    if (!freeTextValue.trim()) return;

    const source = selectedChip ? 'suggested' : 'freetext';
    onAnswer(freeTextValue.trim(), source);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Combine pre-loaded suggestions with fetched ones
  const allSuggestions = [
    ...question.suggested_answers,
    ...(suggestionsData?.suggestions || []),
  ].filter((s, i, arr) => arr.findIndex(x => x.text === s.text) === i); // Dedupe

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="pb-3">
        {/* Section Badge and Priority */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{sectionIcons[question.section] || '📋'}</span>
            <Badge variant="outline" className="capitalize">
              {question.section.replace('_', ' ')}
            </Badge>
          </div>
          <Badge variant="outline" className={cn('capitalize', priorityColors[question.priority])}>
            {question.priority} priority
          </Badge>
        </div>

        {/* Question Text */}
        <h3 className="text-lg font-semibold leading-snug">{question.question}</h3>

        {/* Rationale Tooltip */}
        {question.rationale && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="flex items-center gap-1 text-sm text-muted-foreground mt-2 hover:text-foreground">
                  <HelpCircle className="h-4 w-4" />
                  Why is this needed?
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p>{question.rationale}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Confidence Indicator for extracted value */}
        {question.extracted_value && (
          <div className="p-3 rounded-lg bg-muted/50 border">
            <ConfidenceIndicator
              confidence={question.extracted_confidence}
              extractedValue={question.extracted_value}
            />
          </div>
        )}

        {/* Suggestions / Answer Chips */}
        <div>
          <p className="text-sm text-muted-foreground mb-2">
            {suggestionsLoading ? 'Loading suggestions...' : 'Suggested answers:'}
          </p>
          {suggestionsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Generating suggestions...</span>
            </div>
          ) : (
            <AnswerChips
              suggestions={allSuggestions}
              selectedId={selectedChip}
              onSelect={handleChipSelect}
            />
          )}
        </div>

        {/* Free Text Input */}
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">
            Or type your own answer:
          </label>
          <Textarea
            value={freeTextValue}
            onChange={(e) => {
              setFreeTextValue(e.target.value);
              if (selectedChip) setSelectedChip(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Enter your answer..."
            className="min-h-[80px] resize-none"
            disabled={isSubmitting}
          />
          <p className="text-xs text-muted-foreground">
            Press Cmd+Enter to submit
          </p>
        </div>

        {/* Form Field Preview */}
        {question.form_field && (
          <FormFieldPreview formField={question.form_field} />
        )}

        {/* Submit Button */}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            onClick={handleSubmit}
            disabled={!freeTextValue.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Submit Answer
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
