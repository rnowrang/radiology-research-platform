/**
 * Document Mode - Section-by-section document editing with AI assistance
 *
 * Matching questionnaire wizard appearance with:
 * - Sidebar with section navigation and progress
 * - Card-based content editing
 * - Consistent navigation
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIntelligenceStore } from '@/stores/intelligenceStore';
import * as intelligenceApi from '@/lib/intelligenceApi';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  FileText,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Eye,
  Circle,
  Check,
} from 'lucide-react';

interface DocumentModeProps {
  projectId: string;
  sessionId: string;
}

// Document sections with emojis
const DOCUMENT_SECTIONS = [
  { id: 'title', name: 'Title & Summary', emoji: '📋', description: 'Study title and brief overview' },
  { id: 'background', name: 'Background', emoji: '📚', description: 'Scientific background and rationale' },
  { id: 'objectives', name: 'Objectives', emoji: '🎯', description: 'Primary and secondary objectives' },
  { id: 'study_design', name: 'Study Design', emoji: '🔬', description: 'Design methodology and approach' },
  { id: 'population', name: 'Population', emoji: '👥', description: 'Eligibility criteria and recruitment' },
  { id: 'procedures', name: 'Procedures', emoji: '📝', description: 'Study procedures and timeline' },
  { id: 'risks', name: 'Risks & Benefits', emoji: '⚠️', description: 'Potential risks and benefits' },
  { id: 'privacy', name: 'Privacy', emoji: '🔒', description: 'Data protection and confidentiality' },
  { id: 'analysis', name: 'Analysis Plan', emoji: '📊', description: 'Statistical methods and endpoints' },
];

export function DocumentMode({ projectId, sessionId }: DocumentModeProps) {
  const queryClient = useQueryClient();
  const { currentDocumentId, currentSectionId, setCurrentDocument, getProgress } = useIntelligenceStore();

  const [selectedSection, setSelectedSection] = useState(DOCUMENT_SECTIONS[0].id);
  const [sectionContent, setSectionContent] = useState<Record<string, string>>({});
  const [editedContent, setEditedContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const progress = getProgress();

  // Fetch knowledge stats to understand available data
  const knowledgeQuery = useQuery({
    queryKey: ['knowledge-stats', projectId],
    queryFn: () => intelligenceApi.getKnowledgeStats(projectId),
    enabled: !!projectId,
  });

  // Load section content from knowledge base
  useEffect(() => {
    if (selectedSection) {
      setCurrentDocument('protocol', selectedSection);
      const existing = sectionContent[selectedSection] || '';
      setEditedContent(existing);
    }
  }, [selectedSection, sectionContent, setCurrentDocument]);

  // Generate section content mutation
  const generateMutation = useMutation({
    mutationFn: async (sectionId: string) => {
      const response = await intelligenceApi.sendChatMessage(
        sessionId,
        `Generate the "${DOCUMENT_SECTIONS.find(s => s.id === sectionId)?.name}" section for my research protocol based on the information I've provided.`
      );
      return { sectionId, content: response.message.content };
    },
    onSuccess: ({ sectionId, content }) => {
      setSectionContent((prev) => ({ ...prev, [sectionId]: content }));
      setEditedContent(content);
    },
  });

  // Save section content mutation
  const saveMutation = useMutation({
    mutationFn: async ({ sectionId, content }: { sectionId: string; content: string }) => {
      await intelligenceApi.addFact(
        projectId,
        `protocol.${sectionId}`,
        content,
        'document_mode',
        1.0
      );
      return { sectionId, content };
    },
    onSuccess: ({ sectionId, content }) => {
      setSectionContent((prev) => ({ ...prev, [sectionId]: content }));
      queryClient.invalidateQueries({ queryKey: ['knowledge-stats', projectId] });
    },
  });

  // Check coherence for current content
  const checkCoherenceMutation = useMutation({
    mutationFn: () =>
      intelligenceApi.checkRealtimeCoherence(
        projectId,
        `protocol.${selectedSection}`,
        editedContent,
        'document_mode'
      ),
  });

  const handleSave = () => {
    saveMutation.mutate({ sectionId: selectedSection, content: editedContent });
  };

  const handleGenerate = () => {
    generateMutation.mutate(selectedSection);
  };

  const handleCheckCoherence = () => {
    checkCoherenceMutation.mutate();
  };

  const currentSectionInfo = DOCUMENT_SECTIONS.find((s) => s.id === selectedSection);
  const currentIndex = DOCUMENT_SECTIONS.findIndex((s) => s.id === selectedSection);
  const completedSections = Object.keys(sectionContent).filter(k => sectionContent[k]).length;
  const completionPercentage = Math.round((completedSections / DOCUMENT_SECTIONS.length) * 100);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r bg-muted/30 flex flex-col h-full shrink-0">
        {/* Document Progress */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Document Progress</span>
            <span className="text-sm text-muted-foreground">
              {completionPercentage}%
            </span>
          </div>
          <Progress value={completionPercentage} className="h-2" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{completedSections} complete</span>
            <span>{DOCUMENT_SECTIONS.length - completedSections} remaining</span>
          </div>
        </div>

        {/* Sections List */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {DOCUMENT_SECTIONS.map((section, index) => {
              const hasContent = !!sectionContent[section.id];
              const isSelected = selectedSection === section.id;

              return (
                <Button
                  key={section.id}
                  variant="ghost"
                  className={cn(
                    'w-full justify-start h-auto py-3 px-3 mb-1',
                    isSelected && 'bg-primary/10 border border-primary/20',
                    hasContent && !isSelected && 'text-muted-foreground'
                  )}
                  onClick={() => setSelectedSection(section.id)}
                >
                  <div className="flex items-start gap-3 w-full">
                    {/* Status Icon */}
                    <div className="mt-0.5">
                      {hasContent ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <Circle className={cn(
                          'h-4 w-4',
                          isSelected ? 'text-primary' : 'text-muted-foreground'
                        )} />
                      )}
                    </div>

                    {/* Section Info */}
                    <div className="flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{section.emoji}</span>
                        <span className={cn(
                          'text-sm font-medium',
                          hasContent && !isSelected && 'text-muted-foreground'
                        )}>
                          {section.name}
                        </span>
                      </div>
                    </div>

                    {/* Arrow for current */}
                    {isSelected && (
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
                {completedSections}
              </div>
              <div className="text-xs text-muted-foreground">Complete</div>
            </div>
            <div className="p-2 rounded bg-muted/50">
              <div className="text-lg font-semibold text-amber-600">
                {DOCUMENT_SECTIONS.length - completedSections}
              </div>
              <div className="text-xs text-muted-foreground">Remaining</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b bg-background shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Section {currentIndex + 1} of {DOCUMENT_SECTIONS.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
              >
                <Eye className="h-4 w-4 mr-2" />
                {showPreview ? 'Edit' : 'Preview'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckCoherence}
                disabled={checkCoherenceMutation.isPending || !editedContent}
              >
                {checkCoherenceMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Check
              </Button>
            </div>
          </div>
          <Progress value={(currentIndex / DOCUMENT_SECTIONS.length) * 100} className="h-1" />
        </div>

        {/* Content area */}
        <div className="flex-1 p-6 overflow-auto">
          <Card className="max-w-3xl mx-auto">
            <CardHeader className="pb-3">
              {/* Section Badge */}
              <div className="flex items-center justify-between mb-2">
                <Badge variant="outline" className="capitalize">
                  {currentSectionInfo?.emoji} {currentSectionInfo?.name}
                </Badge>
              </div>

              {/* Section Title */}
              <h3 className="text-lg font-semibold leading-snug">{currentSectionInfo?.name}</h3>
              <p className="text-sm text-muted-foreground">{currentSectionInfo?.description}</p>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Coherence warnings */}
              {checkCoherenceMutation.data?.conflicts &&
                checkCoherenceMutation.data.conflicts.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      {checkCoherenceMutation.data.conflicts.length} consistency issue(s) found.
                      {checkCoherenceMutation.data.conflicts.map((c, i) => (
                        <div key={i} className="mt-1 text-sm">
                          {c.description}
                        </div>
                      ))}
                    </AlertDescription>
                  </Alert>
                )}

              {/* Generate suggestion */}
              {!editedContent && !sectionContent[selectedSection] && (
                <Alert className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
                  <Sparkles className="h-4 w-4 text-purple-600" />
                  <AlertDescription className="flex flex-col gap-2">
                    <span className="font-medium text-purple-900">
                      Generate content from your questionnaire answers
                    </span>
                    <p className="text-sm text-purple-700">
                      I can create a draft for this section based on the information you've provided.
                    </p>
                    <Button
                      size="sm"
                      onClick={handleGenerate}
                      disabled={generateMutation.isPending}
                      className="bg-purple-600 hover:bg-purple-700 w-fit"
                    >
                      {generateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      Generate Draft
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {/* Content editor/preview */}
              {showPreview ? (
                <div className="prose prose-sm max-w-none p-4 rounded-lg bg-muted/30 min-h-[300px]">
                  {editedContent || (
                    <p className="text-muted-foreground italic">
                      No content yet. Click "Generate Draft" to create content.
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    {sectionContent[selectedSection] ? 'Edit content:' : 'Write or generate content:'}
                  </label>
                  <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    placeholder={`Write or generate the ${currentSectionInfo?.name} section...`}
                    className="min-h-[300px] font-mono text-sm"
                  />
                </div>
              )}
            </CardContent>

            <CardFooter className="flex justify-between items-center border-t pt-4">
              <div className="text-xs text-muted-foreground">
                {sectionContent[selectedSection] ? 'Content saved' : 'Not saved yet'}
              </div>
              <div className="flex gap-2">
                {sectionContent[selectedSection] && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerate}
                    disabled={generateMutation.isPending}
                  >
                    {generateMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Regenerate
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saveMutation.isPending || !editedContent}
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Save Section
                </Button>
              </div>
            </CardFooter>
          </Card>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between p-4 border-t bg-background shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (currentIndex > 0) {
                setSelectedSection(DOCUMENT_SECTIONS[currentIndex - 1].id);
              }
            }}
            disabled={currentIndex === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {completedSections} of {DOCUMENT_SECTIONS.length} sections complete
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (currentIndex < DOCUMENT_SECTIONS.length - 1) {
                setSelectedSection(DOCUMENT_SECTIONS[currentIndex + 1].id);
              }
            }}
            disabled={currentIndex === DOCUMENT_SECTIONS.length - 1}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default DocumentMode;
