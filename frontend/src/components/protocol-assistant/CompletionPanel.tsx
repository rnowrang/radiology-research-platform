import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sparkles,
  ChevronDown,
  Loader2,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { protocolAssistantApi, WizardProgress } from '@/lib/protocolAssistantApi';
import { useWizardStore, GeneratedDocument } from '@/stores/wizardStore';
import { toast } from '@/hooks/useToast';
import { FormTemplatePicker } from './FormTemplatePicker';
import { templatesApi, formsApi } from '@/lib/api';

interface CompletionPanelProps {
  sessionId: string;
  projectId?: string;
  progress: WizardProgress;
  skippedQuestions: string[];
  onReviewSkipped: (questionId: string) => void;
}

export function CompletionPanel({
  sessionId,
  projectId,
  progress,
  skippedQuestions,
  onReviewSkipped,
}: CompletionPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [generatingType, setGeneratingType] = useState<string>();
  const [showFormPicker, setShowFormPicker] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState<GeneratedDocument | null>(null);
  const queryClient = useQueryClient();

  // Use wizard store for generated documents (persists across component remounts)
  const {
    questions,
    answers,
    generatedDocuments,
    addGeneratedDocument,
    addGeneratedDocuments,
  } = useWizardStore();

  const hasSkippedQuestions = skippedQuestions.length > 0;
  const answeredCount = progress.answered_count;
  const skippedCount = progress.skipped_count;
  const totalQuestions = progress.total_questions;

  // Fetch templates for form picker
  const { data: templatesData } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const response = await templatesApi.list();
      return response.data.data || [];
    },
  });

  // Fetch existing forms for the project
  const { data: existingFormsData } = useQuery({
    queryKey: ['forms', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const response = await formsApi.list({ projectId, status: 'draft' });
      return response.data.data || [];
    },
    enabled: !!projectId,
  });

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
    onMutate: (type) => {
      setGeneratingType(type);
    },
    onSuccess: (result) => {
      setGeneratingType(undefined);
      queryClient.invalidateQueries({ queryKey: ['chatHistory', sessionId] });

      // Handle single document vs bulk generation
      if (Array.isArray(result)) {
        // Bulk generation - add all to list
        const successfulDocs = result
          .filter((d: GeneratedDocument) => d.quality_score > 0)
          .map((d: GeneratedDocument) => ({
            doc_type: d.doc_type,
            content: d.content,
            word_count: d.word_count || 0,
            quality_score: d.quality_score || 0,
            suggestions: d.suggestions || [],
          }));
        addGeneratedDocuments(successfulDocs);
        toast({
          title: 'Documents Generated',
          description: `Successfully generated ${successfulDocs.length} documents.`,
        });
      } else if (result && typeof result === 'object' && 'doc_type' in result) {
        // Single document - add to store and show in modal
        const doc: GeneratedDocument = {
          doc_type: result.doc_type,
          content: result.content,
          word_count: result.word_count || 0,
          quality_score: result.quality_score || 0,
          suggestions: result.suggestions || [],
        };
        addGeneratedDocument(doc);
        setGeneratedDoc(doc);
        setShowDocumentModal(true);

        toast({
          title: 'Document Generated',
          description: `Successfully generated ${doc.doc_type?.replace(/_/g, ' ') || 'document'}.`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Received unexpected response format from server',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to generate document',
      });
      setGeneratingType(undefined);
    },
  });

  // Prefill form mutation
  const prefillMutation = useMutation({
    mutationFn: async ({ formId, isNew }: { formId: number; isNew: boolean }) => {
      if (isNew) {
        // Create new form and prefill
        return protocolAssistantApi.prefillFormFromWizard(sessionId, formId);
      } else {
        // Prefill existing form
        return protocolAssistantApi.prefillForm(sessionId, formId);
      }
    },
    onSuccess: (result) => {
      setShowFormPicker(false);
      toast({
        title: 'Form Pre-filled',
        description: `Successfully pre-filled ${result.prefilled_fields?.length || result.fields_populated || 0} fields.`,
      });

      // Redirect to the form if we have a URL
      const formId = result.form_id;
      if (formId) {
        window.open(`/forms/${formId}`, '_blank');
      }
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to pre-fill form',
      });
    },
  });

  const handlePrefillForm = () => {
    setShowFormPicker(true);
  };

  const handleSelectTemplate = (templateId: number) => {
    prefillMutation.mutate({ formId: templateId, isNew: true });
  };

  const handleSelectExisting = (formId: number) => {
    prefillMutation.mutate({ formId, isNew: false });
  };

  const handleCopyDocument = () => {
    if (generatedDoc?.content) {
      const textContent = typeof generatedDoc.content === 'string'
        ? generatedDoc.content
        : JSON.stringify(generatedDoc.content, null, 2);
      navigator.clipboard.writeText(textContent);
      toast({
        title: 'Copied',
        description: 'Document content copied to clipboard',
      });
    }
  };

  const sectionNames = Object.keys(answersBySection);
  const isGenerating = generateMutation.isPending;

  // Transform data for FormTemplatePicker
  const templates = (templatesData || []).map((t: { id: number; name: string; schema?: { sections?: unknown[] } }) => ({
    id: t.id,
    name: t.name,
    fieldCount: t.schema?.sections?.length || 0,
  }));

  const existingForms = (existingFormsData || []).map((f: { id: number; title: string; status: string }) => ({
    id: f.id,
    name: f.title,
    fieldCount: 0,
    status: f.status,
  }));

  return (
    <div className="flex h-full gap-4 p-3 overflow-hidden">
      {/* Left Panel - Answers Summary (scrollable) */}
      <div className="flex-1 flex flex-col min-w-0 border rounded-lg bg-background overflow-hidden">
        {/* Header */}
        <div className="shrink-0 p-2.5 border-b">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-full bg-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-green-800">Protocol Review Complete!</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                  {answeredCount} answered
                </Badge>
                {skippedCount > 0 && (
                  <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
                    {skippedCount} skipped
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  of {totalQuestions} questions
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Warning for Skipped Questions */}
        {hasSkippedQuestions && (
          <div className="shrink-0 mx-2.5 mt-2 flex items-center justify-between p-2 rounded-lg border border-yellow-200 bg-yellow-50/50">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 flex-shrink-0" />
              <span className="text-sm text-yellow-800">
                {skippedCount} skipped question{skippedCount !== 1 ? 's' : ''} need review
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => skippedQuestions[0] && onReviewSkipped(skippedQuestions[0])}
              className="h-7 text-xs border-yellow-400 text-yellow-800 hover:bg-yellow-100"
            >
              Review
            </Button>
          </div>
        )}

        {/* Answers by Section - Scrollable */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-2.5 space-y-1">
            <h4 className="text-sm font-medium flex items-center gap-2 mb-2">
              <FileText className="h-4 w-4" />
              Your Answers
            </h4>
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
                      <button className="flex items-center justify-between w-full p-2.5 rounded-lg border hover:bg-muted/50 transition-colors text-left">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium capitalize">
                            {section.replace(/_/g, ' ')}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {sectionAnswers.length}
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
                      <div className="pl-3 pt-1.5 space-y-2">
                        {sectionAnswers.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-lg bg-muted/30 border-l-2 border-primary/30"
                          >
                            <p className="text-xs font-medium text-muted-foreground">
                              {item.question}
                            </p>
                            <p className="text-sm mt-0.5">{item.answer}</p>
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
      </div>

      {/* Right Panel - Actions & Generated Documents */}
      <div className="w-72 shrink-0 flex flex-col gap-3 overflow-hidden">
        {/* Actions Card */}
        <div className="border rounded-lg bg-background p-3 space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Actions
          </h4>

          {/* Generate Documents */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Generate Documents</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => generateMutation.mutate('abstract')}
                disabled={isGenerating}
              >
                {generatingType === 'abstract' ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <FileText className="mr-1 h-3 w-3" />
                )}
                Abstract
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => generateMutation.mutate('consent')}
                disabled={isGenerating}
              >
                {generatingType === 'consent' ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <FileText className="mr-1 h-3 w-3" />
                )}
                Consent
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => generateMutation.mutate('protocol')}
                disabled={isGenerating}
              >
                {generatingType === 'protocol' ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <FileText className="mr-1 h-3 w-3" />
                )}
                Protocol
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => generateMutation.mutate('all')}
                disabled={isGenerating}
              >
                {generatingType === 'all' ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-3 w-3" />
                )}
                All
              </Button>
            </div>
          </div>

          {/* Pre-fill Form */}
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Pre-fill IRB Form</p>
            <Button
              onClick={handlePrefillForm}
              disabled={hasSkippedQuestions || isGenerating || prefillMutation.isPending}
              className="w-full gap-2"
              size="sm"
            >
              {prefillMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Pre-fill IRB Form
            </Button>
            {hasSkippedQuestions && (
              <p className="text-xs text-yellow-600">
                Review skipped questions first
              </p>
            )}
          </div>
        </div>

        {/* Generated Documents Card */}
        <div className="border rounded-lg bg-background p-3 flex-1 min-h-0 flex flex-col overflow-hidden">
          <h4 className="text-sm font-medium flex items-center gap-2 mb-2 shrink-0">
            <FileText className="h-4 w-4 text-primary" />
            Generated Documents
            {generatedDocuments.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {generatedDocuments.length}
              </Badge>
            )}
          </h4>

          {generatedDocuments.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No documents generated yet. Use the actions above to generate documents.
            </p>
          ) : (
            <ScrollArea className="flex-1 -mx-1 px-1">
              <div className="space-y-2">
                {generatedDocuments.map((doc, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2 rounded-md border bg-muted/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-sm capitalize truncate">
                        {doc.doc_type?.replace(/_/g, ' ') || 'Document'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => {
                          const textContent = typeof doc.content === 'string'
                            ? doc.content
                            : JSON.stringify(doc.content, null, 2);
                          navigator.clipboard.writeText(textContent);
                          toast({
                            title: 'Copied',
                            description: 'Document copied to clipboard',
                          });
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setGeneratedDoc(doc);
                          setShowDocumentModal(true);
                        }}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* Form Template Picker Modal */}
      <FormTemplatePicker
        open={showFormPicker}
        onClose={() => setShowFormPicker(false)}
        onSelectTemplate={handleSelectTemplate}
        onSelectExisting={handleSelectExisting}
        templates={templates}
        existingForms={existingForms}
        isLoading={prefillMutation.isPending}
      />

      {/* Generated Document Modal */}
      <Dialog open={showDocumentModal} onOpenChange={setShowDocumentModal}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Generated {generatedDoc?.doc_type?.replace(/_/g, ' ') || 'Document'}
            </DialogTitle>
            <DialogDescription>
              {generatedDoc?.word_count && (
                <span>~{generatedDoc.word_count} words</span>
              )}
              {generatedDoc?.quality_score !== undefined && (
                <span className="ml-3">
                  Quality Score: {Math.round(generatedDoc.quality_score)}%
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[50vh] mt-4">
            <div className="p-4 bg-muted/30 rounded-lg">
              <pre className="whitespace-pre-wrap text-sm font-sans">
                {generatedDoc?.content
                  ? typeof generatedDoc.content === 'string'
                    ? generatedDoc.content
                    : JSON.stringify(generatedDoc.content, null, 2)
                  : 'No content available'}
              </pre>
            </div>
          </ScrollArea>

          {generatedDoc?.suggestions && generatedDoc.suggestions.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">Suggestions</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                {generatedDoc.suggestions.map((suggestion: string, idx: number) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-primary">•</span>
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={handleCopyDocument}>
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
            <Button onClick={() => setShowDocumentModal(false)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
