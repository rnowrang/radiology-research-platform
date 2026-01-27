import { useQuery } from '@tanstack/react-query';
import { protocolAssistantApi } from '@/lib/protocolAssistantApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  CheckCircle2,
  FileText,
  Sparkles,
  AlertCircle,
  ChevronRight,
  RefreshCcw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { QuestionnaireProgressResponse } from '@/lib/protocolAssistantApi';

interface QuestionnaireCompletionPanelProps {
  projectId: string;
  progress: QuestionnaireProgressResponse;
  skippedQuestions: string[];
  onReviewSkipped: (questionId: string) => void;
  onComplete?: () => void;
}

export function QuestionnaireCompletionPanel({
  projectId,
  progress,
  skippedQuestions,
  onReviewSkipped,
  onComplete,
}: QuestionnaireCompletionPanelProps) {
  const navigate = useNavigate();

  // Fetch knowledge stats to show completion status
  const { data: knowledgeStats } = useQuery({
    queryKey: ['knowledgeStats', projectId],
    queryFn: () => protocolAssistantApi.getKnowledgeStats(projectId),
    enabled: !!projectId,
  });

  const handleNavigateToForms = () => {
    navigate(`/projects/${projectId}`);
    onComplete?.();
  };

  const handleNavigateToProtocolAssistant = () => {
    navigate(`/projects/${projectId}/protocol-assistant`);
    onComplete?.();
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Success Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Questionnaire Complete!</h2>
        <p className="text-muted-foreground">
          Great job! You've provided all the information needed to fill your forms.
        </p>
      </div>

      {/* Progress Summary */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3 rounded-lg bg-green-50 border border-green-200">
              <div className="text-2xl font-bold text-green-700">{progress.answered_count}</div>
              <div className="text-sm text-green-600">Answered</div>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <div className="text-2xl font-bold text-amber-700">{progress.skipped_count}</div>
              <div className="text-sm text-amber-600">Skipped</div>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="text-2xl font-bold text-blue-700">{progress.total_questions}</div>
              <div className="text-sm text-blue-600">Total</div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Completion</span>
              <span className="font-medium">{progress.completion_percentage}%</span>
            </div>
            <Progress value={progress.completion_percentage} className="h-2" />
          </div>

          {knowledgeStats && (
            <div className="pt-2 border-t">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Knowledge Base Facts</span>
                <span className="font-medium">{knowledgeStats.total_facts}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Skipped Questions Warning */}
      {skippedQuestions.length > 0 && (
        <Alert variant="default" className="mb-6 border-amber-200 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800">Some questions were skipped</AlertTitle>
          <AlertDescription className="text-amber-700">
            You skipped {skippedQuestions.length} question{skippedQuestions.length > 1 ? 's' : ''}.
            These fields may not be auto-filled in your forms.
            <Button
              variant="link"
              size="sm"
              className="text-amber-700 underline p-0 h-auto ml-1"
              onClick={() => onReviewSkipped(skippedQuestions[0])}
            >
              Review skipped questions
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Next Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            What's Next?
          </CardTitle>
          <CardDescription>
            Your answers have been saved to the project knowledge base.
            Now you can auto-fill your forms with this information.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full justify-between h-auto py-4"
            onClick={handleNavigateToForms}
          >
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5" />
              <div className="text-left">
                <div className="font-medium">Go to Project Tasks</div>
                <div className="text-sm text-primary-foreground/80">
                  Fill your IRB forms with AI assistance
                </div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5" />
          </Button>

          <Button
            variant="outline"
            className="w-full justify-between h-auto py-4"
            onClick={handleNavigateToProtocolAssistant}
          >
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5" />
              <div className="text-left">
                <div className="font-medium">Open Protocol Assistant</div>
                <div className="text-sm text-muted-foreground">
                  Generate documents or continue chatting
                </div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </CardContent>
        <CardFooter className="flex justify-center border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReviewSkipped(skippedQuestions[0] || '')}
            className="text-muted-foreground"
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            Review All Answers
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
