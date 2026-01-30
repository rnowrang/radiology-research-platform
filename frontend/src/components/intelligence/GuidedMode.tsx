/**
 * Guided Mode - Structured questionnaire interface
 *
 * Replicates the original questionnaire wizard appearance with:
 * - Sidebar with sections and progress
 * - Card-based question display
 * - AI suggestion banner with gradient styling
 * - Navigation buttons
 */

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIntelligenceStore } from '@/stores/intelligenceStore';
import * as intelligenceApi from '@/lib/intelligenceApi';
import { protocolAssistantApi } from '@/lib/protocolAssistantApi';
import { FormFillPreviewModal } from '@/components/protocol-assistant/FormFillPreviewModal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  SkipForward,
  Sparkles,
  CheckCircle2,
  Circle,
  HelpCircle,
  Check,
  FileText,
  Loader2,
  Clock,
  RotateCcw,
  PartyPopper,
  ClipboardList,
} from 'lucide-react';

interface GuidedModeProps {
  projectId: string;
  sessionId: string;
  onComplete?: () => void;
  onSwitchToChat?: () => void;
}

// Section icons (emojis like original)
const sectionIcons: Record<string, string> = {
  study_info: '📋',
  personnel: '👥',
  objectives: '🎯',
  methodology: '🔬',
  population: '🎯',
  recruitment: '📢',
  procedures: '📝',
  risks: '⚠️',
  privacy: '🔒',
  consent: '✍️',
  regulatory: '📜',
  funding: '💰',
  data_collection: '💾',
  timeline: '📅',
  other: '📝',
};

// Priority styles (matching original)
const priorityStyles: Record<string, { badge: string; label: string }> = {
  high: { badge: 'bg-red-100 text-red-800 border-red-200', label: 'Required' },
  required: { badge: 'bg-red-100 text-red-800 border-red-200', label: 'Required' },
  medium: { badge: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'Recommended' },
  recommended: { badge: 'bg-yellow-100 text-yellow-800 border-yellow-200', label: 'Recommended' },
  low: { badge: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Optional' },
  optional: { badge: 'bg-blue-100 text-blue-800 border-blue-200', label: 'Optional' },
};

export function GuidedMode({
  projectId,
  sessionId,
  onComplete,
  onSwitchToChat,
}: GuidedModeProps) {
  const queryClient = useQueryClient();

  const {
    questions,
    sections,
    answers,
    skippedQuestions,
    currentQuestionIndex,
    getCurrentQuestion,
    getProgress,
    setAnswer,
    skipQuestion,
    goNext,
    goPrevious,
    goToSection,
    isComplete,
    generatedDocuments,
    addGeneratedDocument,
  } = useIntelligenceStore();

  const [inputValue, setInputValue] = useState<string | number | boolean | string[]>('');
  const [showSuggestion, setShowSuggestion] = useState(true);

  const currentQuestion = getCurrentQuestion();
  const progress = getProgress();
  const isAnswered = currentQuestion && answers[currentQuestion.id];
  const isSkipped = currentQuestion && skippedQuestions.includes(currentQuestion.id);

  // Load existing answer and reset suggestion state when question changes
  useEffect(() => {
    if (currentQuestion) {
      const existing = answers[currentQuestion.id];
      if (existing) {
        setInputValue(existing.value);
        setShowSuggestion(false);
      } else {
        setInputValue('');
        setShowSuggestion(true);
      }
    }
  }, [currentQuestion?.id, answers]);

  // Note: Suggestions are now provided directly in the question object from the questionnaire API
  // (via suggestedAnswer, suggestedAnswerConfidence, suggestionSource fields)
  // The separate getQuestionSuggestions endpoint is only for the legacy wizard service
  // and doesn't support the new unified questionnaire, so we skip the redundant call.

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
      setAnswer(questionId, value, source);
      // Map frontend source to backend FactSource enum value
      // Backend accepts: 'document', 'wizard', 'user_input', 'learned', 'extracted'
      const apiSource = source === 'suggested' ? 'extracted' : 'wizard';
      return intelligenceApi.submitAnswer(projectId, questionId, value, apiSource);
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
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const generateMutation = useMutation({
    mutationFn: (
      docType: 'abstract' | 'consent_form' | 'protocol' | 'recruitment_materials' | 'data_management_plan'
    ) => {
      setGeneratingType(docType);
      return intelligenceApi.generateDocument(sessionId, docType);
    },
    onSuccess: (doc) => {
      setGenerateError(null);
      setGeneratingType(null);
      addGeneratedDocument({
        id: doc.id,
        type: doc.type,
        name: doc.name,
        content: doc.content,
        generatedAt: doc.generatedAt,
        downloadUrl: doc.downloadUrl,
      });
    },
    onError: (error: unknown) => {
      setGeneratingType(null);
      // Extract error message from various possible structures
      const axiosError = error as { response?: { data?: { detail?: string; error?: string; message?: string } }; message?: string };
      const detail =
        axiosError.response?.data?.detail ||
        axiosError.response?.data?.error ||
        axiosError.response?.data?.message ||
        axiosError.message ||
        'Unknown error';

      if (detail?.toLowerCase().includes('no protocol data') || detail?.toLowerCase().includes('protocol document')) {
        setGenerateError(
          'Document generation requires a protocol document to be uploaded first. ' +
          'Switch to Chat mode and upload your protocol PDF to enable document generation.'
        );
      } else {
        setGenerateError(`Generation failed: ${detail}`);
      }
    },
  });

  // Helper to check if a value is provided (handles boolean false as valid)
  const hasValue = (val: string | number | boolean | string[]): boolean => {
    if (typeof val === 'boolean') return true; // false is a valid answer
    if (typeof val === 'number') return true; // 0 is a valid answer
    if (Array.isArray(val)) return val.length > 0;
    return val !== '' && val !== undefined && val !== null;
  };

  const handleSubmit = () => {
    if (!currentQuestion || !hasValue(inputValue)) return;
    submitMutation.mutate({
      questionId: currentQuestion.id,
      value: inputValue,
      source: 'user',
    });
  };

  const handleUseSuggestion = (value: string) => {
    if (!currentQuestion) return;
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
        projectId={projectId}
        progress={progress}
        generatedDocuments={generatedDocuments}
        onGenerateDocument={(type) => generateMutation.mutate(type)}
        isGenerating={generateMutation.isPending}
        generatingType={generatingType}
        generateError={generateError}
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

  const priorityConfig = priorityStyles[currentQuestion.priority] || priorityStyles.optional;
  // Suggestions come directly from the question object (populated by questionnaire API)
  const suggestedAnswer = currentQuestion.suggestedAnswer;
  const suggestionConfidence = currentQuestion.suggestedAnswerConfidence;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar - matching original questionnaire style */}
      <div className="w-64 border-r bg-muted/30 flex flex-col h-full shrink-0">
        {/* Overall Progress */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall Progress</span>
            <span className="text-sm text-muted-foreground">
              {progress.completionPercentage}%
            </span>
          </div>
          <Progress value={progress.completionPercentage} className="h-2" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{progress.answered} answered</span>
            <span>{progress.skipped} skipped</span>
          </div>
        </div>

        {/* Estimated Time */}
        {progress.estimatedRemainingMinutes > 0 && (
          <div className="px-4 py-2 border-b flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>~{progress.estimatedRemainingMinutes} min remaining</span>
          </div>
        )}

        {/* Sections List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {sections.map((section, index) => {
              const sectionProgress = progress.sectionProgress[section.id] || {
                total: 0,
                answered: 0,
                skipped: 0,
              };
              const isComplete = sectionProgress.answered + sectionProgress.skipped >= sectionProgress.total;
              const isCurrent = currentQuestion?.section === section.id;
              const percentage = sectionProgress.total > 0
                ? Math.round(((sectionProgress.answered + sectionProgress.skipped) / sectionProgress.total) * 100)
                : 0;

              return (
                <Button
                  key={section.id || `section-${index}`}
                  variant="ghost"
                  className={cn(
                    'w-full justify-start h-auto py-3 px-3 mb-1',
                    isCurrent && 'bg-primary/10 border border-primary/20',
                    isComplete && !isCurrent && 'text-muted-foreground'
                  )}
                  onClick={() => goToSection(section.id)}
                >
                  <div className="flex items-start gap-3 w-full">
                    {/* Status Icon */}
                    <div className="mt-0.5">
                      {isComplete ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Circle className={cn(
                          'h-4 w-4',
                          isCurrent ? 'text-primary' : 'text-muted-foreground'
                        )} />
                      )}
                    </div>

                    {/* Section Info */}
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{sectionIcons[section.id] || '📝'}</span>
                        <span className={cn(
                          'text-sm font-medium',
                          isComplete && !isCurrent && 'text-muted-foreground'
                        )}>
                          {section.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Progress value={percentage} className="h-1 flex-1" />
                        <span className="text-xs text-muted-foreground min-w-[3ch]">
                          {sectionProgress.answered}/{sectionProgress.total}
                        </span>
                      </div>
                    </div>

                    {/* Arrow for current */}
                    {isCurrent && (
                      <ChevronRight className="h-4 w-4 text-primary" />
                    )}
                  </div>
                </Button>
              );
            })}
          </div>
        </ScrollArea>

        {/* Summary Stats */}
        <div className="p-4 border-t bg-background">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="p-2 rounded bg-muted/50">
              <div className="text-lg font-semibold text-green-600">
                {progress.answered}
              </div>
              <div className="text-xs text-muted-foreground">Answered</div>
            </div>
            <div className="p-2 rounded bg-muted/50">
              <div className="text-lg font-semibold text-amber-600">
                {progress.total - progress.answered - progress.skipped}
              </div>
              <div className="text-xs text-muted-foreground">Remaining</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Progress Bar */}
        <div className="p-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Question {currentQuestionIndex + 1} of {questions.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSwitchToChat}
              className="text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Switch to Chat
            </Button>
          </div>
          <Progress value={(currentQuestionIndex / questions.length) * 100} className="h-1" />
        </div>

        {/* Question Area */}
        <div className="flex-1 p-6 overflow-auto">
          <Card className="max-w-2xl mx-auto">
            <CardHeader className="pb-3">
              {/* Section Badge and Priority */}
              <div className="flex items-center justify-between mb-2">
                <Badge variant="outline" className="capitalize">
                  {currentQuestion.section?.replace(/_/g, ' ') || 'General'}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn('capitalize', priorityConfig.badge)}
                >
                  {priorityConfig.label}
                </Badge>
              </div>

              {/* Question Text */}
              <h3 className="text-lg font-semibold leading-snug">{currentQuestion.question}</h3>

              {/* Why Needed Tooltip */}
              {(currentQuestion.rationale || currentQuestion.whyNeeded) && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="flex items-center gap-1 text-sm text-muted-foreground mt-2 hover:text-foreground transition-colors">
                        <HelpCircle className="h-4 w-4" />
                        Why is this needed?
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs">
                      <p>{currentQuestion.rationale || currentQuestion.whyNeeded}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </CardHeader>

            <CardContent className="space-y-4">
              {/* AI Suggestion Banner - Purple Gradient like original */}
              {suggestedAnswer && showSuggestion && (
                <Alert className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  <AlertDescription className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-purple-900">Suggested Answer</span>
                      {suggestionConfidence && (
                        <Badge variant="outline" className="text-purple-600 border-purple-300">
                          {Math.round(suggestionConfidence * 100)}% confidence
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-purple-800 bg-white/50 p-2 rounded border border-purple-100">
                      {suggestedAnswer}
                    </p>
                    <div className="flex gap-2 mt-1">
                      <Button
                        size="sm"
                        onClick={() => handleUseSuggestion(suggestedAnswer)}
                        disabled={submitMutation.isPending}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Use This Answer
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setInputValue(suggestedAnswer);
                          setShowSuggestion(false);
                        }}
                        disabled={submitMutation.isPending}
                      >
                        Edit
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Answer Input */}
              <div>
                {!suggestedAnswer || !showSuggestion ? (
                  <>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      {suggestedAnswer ? 'Edit your answer:' : 'Your answer:'}
                    </label>
                    <AnswerInput
                      type={currentQuestion.answerType}
                      options={currentQuestion.options}
                      value={inputValue}
                      onChange={setInputValue}
                      disabled={submitMutation.isPending}
                    />
                    <Button
                      className="mt-3"
                      onClick={handleSubmit}
                      disabled={!hasValue(inputValue) || submitMutation.isPending}
                    >
                      {submitMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Check className="h-4 w-4 mr-2" />
                      )}
                      {isAnswered ? 'Update Answer' : 'Submit Answer'}
                    </Button>
                  </>
                ) : null}
              </div>
            </CardContent>

            <CardFooter className="flex justify-between items-center text-xs text-muted-foreground border-t pt-4">
              <div className="flex items-center gap-1">
                {currentQuestion.usedInForms && currentQuestion.usedInForms.length > 0 && (
                  <>
                    <FileText className="h-3 w-3" />
                    <span>Used in: {currentQuestion.usedInForms.join(', ')}</span>
                  </>
                )}
              </div>
              {currentQuestion.priority !== 'required' && currentQuestion.priority !== 'high' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSkip}
                  disabled={skipMutation.isPending}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Skip this question
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between p-4 border-t bg-background shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={goPrevious}
            disabled={currentQuestionIndex === 0 || submitMutation.isPending}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          <div className="flex items-center gap-4">
            {currentQuestion.priority !== 'required' && currentQuestion.priority !== 'high' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                disabled={submitMutation.isPending || skipMutation.isPending}
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
            disabled={currentQuestionIndex >= questions.length - 1 || submitMutation.isPending}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

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
          className="min-h-[100px] resize-none"
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
          className="min-h-[100px] resize-none"
          disabled={disabled}
        />
      );
  }
}

// Document types configuration - types must match backend DocumentType enum values
const documentTypes = [
  { type: 'abstract' as const, label: 'Research Abstract', icon: '📄', description: 'Structured summary for IRB submission' },
  { type: 'consent_form' as const, label: 'Consent Form', icon: '✍️', description: 'Informed consent document' },
  { type: 'protocol' as const, label: 'Protocol Document', icon: '📋', description: 'Complete research protocol' },
  { type: 'recruitment_materials' as const, label: 'Recruitment Materials', icon: '📢', description: 'Participant recruitment flyer' },
  { type: 'data_management_plan' as const, label: 'Data Management Plan', icon: '💾', description: 'Data governance plan' },
];

function CompletionPanel({
  projectId,
  progress,
  generatedDocuments,
  onGenerateDocument,
  isGenerating,
  generatingType,
  generateError,
  onComplete,
}: {
  projectId: string;
  progress: ReturnType<typeof useIntelligenceStore.getState>['getProgress'];
  generatedDocuments: Array<{ id: string; type: string; name: string; content?: string; downloadUrl?: string }>;
  onGenerateDocument: (
    type: 'abstract' | 'consent_form' | 'protocol' | 'recruitment_materials' | 'data_management_plan'
  ) => void;
  isGenerating: boolean;
  generatingType?: string | null;
  generateError?: string | null;
  onComplete?: () => void;
}) {
  const [selectedDoc, setSelectedDoc] = useState<string | null>(
    generatedDocuments.length > 0 ? generatedDocuments[0].id : null
  );
  const [showFormFillModal, setShowFormFillModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>('');

  // Fetch available form templates for pre-fill
  const { data: formTaskData, isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['projectFormTask', projectId],
    queryFn: () => protocolAssistantApi.getProjectFormTask(projectId),
    enabled: !!projectId,
  });

  const selectedDocument = generatedDocuments.find((d) => d.id === selectedDoc);

  const handleOpenFormFill = (templateId: number, templateName: string) => {
    setSelectedTemplateId(templateId);
    setSelectedTemplateName(templateName);
    setShowFormFillModal(true);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left Sidebar - Stats & Document List */}
      <div className="w-72 border-r bg-muted/30 flex flex-col h-full shrink-0">
        {/* Success Header */}
        <div className="p-4 border-b bg-gradient-to-r from-green-50 to-emerald-50">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100">
              <PartyPopper className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-green-900">Complete!</h3>
              <p className="text-xs text-green-700">{progress.answered} questions answered</p>
            </div>
          </div>
        </div>

        {/* Progress Stats */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Completion</span>
            <span className="text-sm font-semibold text-primary">{progress.completionPercentage}%</span>
          </div>
          <Progress value={progress.completionPercentage} className="h-2 mb-3" />
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded bg-green-50">
              <div className="text-lg font-bold text-green-600">{progress.answered}</div>
              <div className="text-[10px] text-green-700">Answered</div>
            </div>
            <div className="p-2 rounded bg-amber-50">
              <div className="text-lg font-bold text-amber-600">{progress.skipped}</div>
              <div className="text-[10px] text-amber-700">Skipped</div>
            </div>
            <div className="p-2 rounded bg-blue-50">
              <div className="text-lg font-bold text-blue-600">{progress.total}</div>
              <div className="text-[10px] text-blue-700">Total</div>
            </div>
          </div>
        </div>

        {/* Generated Documents List */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="px-4 py-2 border-b">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Generated Documents ({generatedDocuments.length})
            </h4>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2">
              {generatedDocuments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No documents generated yet.
                  <br />
                  <span className="text-xs">Click a document type to generate.</span>
                </p>
              ) : (
                generatedDocuments.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => setSelectedDoc(doc.id)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-lg mb-1 text-left transition-colors',
                      selectedDoc === doc.id
                        ? 'bg-primary/10 border border-primary/20'
                        : 'hover:bg-muted'
                    )}
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{doc.name}</div>
                      <div className="text-xs text-muted-foreground">Ready to view</div>
                    </div>
                    {selectedDoc === doc.id && (
                      <ChevronRight className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Continue Action */}
        {onComplete && (
          <div className="p-4 border-t bg-background">
            <Button className="w-full" onClick={onComplete}>
              Continue to Forms
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b bg-background shrink-0">
          <h2 className="text-lg font-semibold">Generate Documents</h2>
          <p className="text-sm text-muted-foreground">
            Create IRB-ready documents from your knowledge base
          </p>
        </div>

        {/* Document Generation Grid */}
        <div className="p-4 border-b bg-muted/20 shrink-0">
          {generateError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{generateError}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-5 gap-2">
            {documentTypes.map(({ type, label, icon, description }) => {
              const generated = generatedDocuments.find((d) => d.type === type);
              const isCurrentlyGenerating = generatingType === type;
              return (
                <button
                  key={type}
                  onClick={() => onGenerateDocument(type)}
                  disabled={isGenerating}
                  className={cn(
                    'flex flex-col items-center p-3 rounded-lg border transition-all text-center',
                    'hover:border-primary/50 hover:bg-primary/5',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    generated && 'bg-green-50 border-green-200',
                    isCurrentlyGenerating && 'border-primary bg-primary/10'
                  )}
                >
                  <div className="text-2xl mb-1">
                    {isCurrentlyGenerating ? (
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    ) : generated ? (
                      <CheckCircle2 className="h-6 w-6 text-green-500" />
                    ) : (
                      icon
                    )}
                  </div>
                  <span className="text-xs font-medium leading-tight">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Pre-fill IRB Forms Section */}
        <div className="p-4 border-b bg-gradient-to-r from-purple-50 to-blue-50 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <ClipboardList className="h-5 w-5 text-purple-600" />
            <h3 className="font-semibold text-purple-900">Pre-fill IRB Forms</h3>
          </div>
          <p className="text-sm text-purple-700 mb-3">
            Use your knowledge base to auto-populate form fields with high accuracy
          </p>

          {isLoadingTemplates ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading available forms...
            </div>
          ) : formTaskData?.available_templates && formTaskData.available_templates.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {formTaskData.available_templates.map((template) => (
                <Button
                  key={template.id}
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenFormFill(template.id, template.name)}
                  className="bg-white hover:bg-purple-50 border-purple-200 hover:border-purple-400 text-purple-900"
                >
                  <Sparkles className="h-4 w-4 mr-2 text-purple-600" />
                  {template.name}
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {template.field_count} fields
                  </Badge>
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No form templates available for this project.
            </p>
          )}
        </div>

        {/* Form Fill Preview Modal */}
        {showFormFillModal && selectedTemplateId && (
          <FormFillPreviewModal
            open={showFormFillModal}
            onOpenChange={setShowFormFillModal}
            projectId={projectId}
            templateId={selectedTemplateId}
            templateName={selectedTemplateName}
          />
        )}

        {/* Document Preview */}
        <div className="flex-1 overflow-hidden">
          {selectedDocument ? (
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between p-4 border-b bg-background shrink-0">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <h3 className="font-semibold">{selectedDocument.name}</h3>
                </div>
                <Badge variant="secondary" className="text-xs">
                  Generated
                </Badge>
              </div>
              <ScrollArea className="flex-1 p-4">
                {selectedDocument.content ? (
                  <div className="prose prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground bg-muted/30 p-4 rounded-lg">
                      {selectedDocument.content}
                    </pre>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Document content not available
                  </p>
                )}
              </ScrollArea>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-center p-8">
              <div>
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-2">No Document Selected</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Generate a document using the buttons above, then select it from the sidebar to preview its content.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GuidedMode;
