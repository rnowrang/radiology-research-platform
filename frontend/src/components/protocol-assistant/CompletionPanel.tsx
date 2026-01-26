import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sparkles,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { protocolAssistantApi, WizardProgress } from '@/lib/protocolAssistantApi';
import { useWizardStore } from '@/stores/wizardStore';
import { toast } from '@/hooks/useToast';

interface CompletionPanelProps {
  sessionId: string;
  progress: WizardProgress;
  skippedQuestions: string[];
  onReviewSkipped: (questionId: string) => void;
}

export function CompletionPanel({
  sessionId,
  progress,
  skippedQuestions,
  onReviewSkipped,
}: CompletionPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [generatingType, setGeneratingType] = useState<string>();
  const queryClient = useQueryClient();
  const { questions, answers } = useWizardStore();

  const hasSkippedQuestions = skippedQuestions.length > 0;
  const answeredCount = progress.answered_count;
  const skippedCount = progress.skipped_count;
  const totalQuestions = progress.total_questions;

  // Build answers by section
  const answersBySection = questions.reduce((acc, q) => {
    const answer = answers[q.id];
    if (answer) {
      if (!acc[q.section]) {
        acc[q.section] = [];
      }
      acc[q.section].push({
        question: q.question,
        answer: answer.answer,
      });
    }
    return acc;
  }, {} as Record<string, Array<{ question: string; answer: string }>>);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  // Generate document mutation
  const generateMutation = useMutation({
    mutationFn: async (type: 'abstract' | 'consent' | 'protocol' | 'all') => {
      setGeneratingType(type);
      switch (type) {
        case 'abstract':
          return protocolAssistantApi.generateAbstract(sessionId);
        case 'consent':
          return protocolAssistantApi.generateConsent(sessionId);
        case 'protocol':
          return protocolAssistantApi.generateProtocol(sessionId);
        case 'all':
          return protocolAssistantApi.generateAll(sessionId);
        default:
          throw new Error('Unknown generation type');
      }
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Document generated successfully',
      });
      setGeneratingType(undefined);
      queryClient.invalidateQueries({ queryKey: ['chatHistory', sessionId] });
    },
    onError: () => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to generate document',
      });
      setGeneratingType(undefined);
    },
  });

  const handlePrefillForm = () => {
    // TODO: Implement form prefill - open FormTemplatePicker modal
    toast({
      title: 'Coming Soon',
      description: 'Form pre-fill functionality will be available soon',
    });
  };

  const sectionNames = Object.keys(answersBySection);
  const isGenerating = generateMutation.isPending;

  return (
    <div className="flex flex-col h-full p-4">
      {/* Celebratory Header */}
      <Card className="mb-4 border-green-200 bg-green-50/50">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-green-100">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <CardTitle className="text-xl text-green-800">
                Protocol Review Complete!
              </CardTitle>
              <p className="text-sm text-green-700 mt-1">
                You've completed the protocol questionnaire
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Summary Stats */}
          <div className="flex gap-4 mt-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm bg-green-100 text-green-800">
                {answeredCount} answered
              </Badge>
            </div>
            {skippedCount > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-sm bg-yellow-100 text-yellow-800">
                  {skippedCount} skipped
                </Badge>
              </div>
            )}
            <span className="text-sm text-muted-foreground">
              of {totalQuestions} total questions
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Warning for Skipped Questions */}
      {hasSkippedQuestions && (
        <Card className="mb-4 border-yellow-200 bg-yellow-50/50">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <h4 className="font-medium text-yellow-800">
                  Review required before form pre-fill
                </h4>
                <p className="text-sm text-yellow-700 mt-1">
                  You have {skippedCount} skipped question{skippedCount !== 1 ? 's' : ''}.
                  Complete these for the best form pre-fill results.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => skippedQuestions[0] && onReviewSkipped(skippedQuestions[0])}
                  className="mt-3 border-yellow-400 text-yellow-800 hover:bg-yellow-100"
                >
                  Review Skipped Questions
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Answers by Section */}
      <Card className="flex-1 flex flex-col min-h-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Your Answers
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full px-6 pb-4">
            <div className="space-y-2">
              {sectionNames.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  No answers recorded yet.
                </p>
              ) : (
                sectionNames.map((section) => {
                  const sectionAnswers = answersBySection[section];
                  const isExpanded = expandedSections[section] ?? false;

                  return (
                    <Collapsible
                      key={section}
                      open={isExpanded}
                      onOpenChange={() => toggleSection(section)}
                    >
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center justify-between w-full p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left">
                          <div className="flex items-center gap-2">
                            <span className="font-medium capitalize">
                              {section.replace(/_/g, ' ')}
                            </span>
                            <Badge variant="outline" className="text-xs">
                              {sectionAnswers.length} answer{sectionAnswers.length !== 1 ? 's' : ''}
                            </Badge>
                          </div>
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="pl-4 pt-2 space-y-3">
                          {sectionAnswers.map((item, idx) => (
                            <div
                              key={idx}
                              className="p-3 rounded-lg bg-muted/30 border-l-2 border-primary/30"
                            >
                              <p className="text-sm font-medium text-muted-foreground">
                                {item.question}
                              </p>
                              <p className="text-sm mt-1">{item.answer}</p>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={isGenerating}>
              {isGenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              {isGenerating ? `Generating ${generatingType}...` : 'Generate Documents'}
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => generateMutation.mutate('abstract')}
              disabled={isGenerating}
            >
              <FileText className="mr-2 h-4 w-4" />
              Abstract
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => generateMutation.mutate('consent')}
              disabled={isGenerating}
            >
              <FileText className="mr-2 h-4 w-4" />
              Consent Form
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => generateMutation.mutate('protocol')}
              disabled={isGenerating}
            >
              <FileText className="mr-2 h-4 w-4" />
              Full Protocol
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => generateMutation.mutate('all')}
              disabled={isGenerating}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Generate All
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          onClick={handlePrefillForm}
          disabled={hasSkippedQuestions || isGenerating}
          className="gap-2"
        >
          <Sparkles className="h-4 w-4" />
          Pre-fill IRB Form
        </Button>
      </div>
    </div>
  );
}
