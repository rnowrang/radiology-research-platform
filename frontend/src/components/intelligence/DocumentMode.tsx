/**
 * Document Mode - Section-by-section document editing with AI assistance
 *
 * Provides:
 * - Document section navigation
 * - AI-assisted content editing
 * - Real-time coherence checking
 * - Content suggestions
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIntelligenceStore } from '@/stores/intelligenceStore';
import * as intelligenceApi from '@/lib/intelligenceApi';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
} from 'lucide-react';

interface DocumentModeProps {
  projectId: string;
  sessionId: string;
}

// Document sections for protocol
const DOCUMENT_SECTIONS = [
  { id: 'title', name: 'Title & Summary', description: 'Study title and brief overview' },
  { id: 'background', name: 'Background', description: 'Scientific background and rationale' },
  { id: 'objectives', name: 'Objectives', description: 'Primary and secondary objectives' },
  { id: 'study_design', name: 'Study Design', description: 'Design methodology and approach' },
  { id: 'population', name: 'Population', description: 'Eligibility criteria and recruitment' },
  { id: 'procedures', name: 'Procedures', description: 'Study procedures and timeline' },
  { id: 'risks', name: 'Risks & Benefits', description: 'Potential risks and benefits' },
  { id: 'privacy', name: 'Privacy', description: 'Data protection and confidentiality' },
  { id: 'analysis', name: 'Analysis Plan', description: 'Statistical methods and endpoints' },
];

export function DocumentMode({ projectId, sessionId }: DocumentModeProps) {
  const queryClient = useQueryClient();
  const { currentDocumentId, currentSectionId, setCurrentDocument } = useIntelligenceStore();

  const [selectedSection, setSelectedSection] = useState(DOCUMENT_SECTIONS[0].id);
  const [sectionContent, setSectionContent] = useState<Record<string, string>>({});
  const [editedContent, setEditedContent] = useState('');
  const [showPreview, setShowPreview] = useState(false);

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
      // Load existing content for this section
      const existing = sectionContent[selectedSection] || '';
      setEditedContent(existing);
    }
  }, [selectedSection, sectionContent, setCurrentDocument]);

  // Generate section content mutation
  const generateMutation = useMutation({
    mutationFn: async (sectionId: string) => {
      // Use the chat API to generate section content
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
      // Add as fact to knowledge base
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

  return (
    <div className="flex h-full">
      {/* Section list */}
      <div className="w-64 border-r bg-muted/30">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Protocol Sections</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Edit your protocol section by section
          </p>
        </div>
        <ScrollArea className="h-[calc(100%-80px)]">
          <div className="p-2">
            {DOCUMENT_SECTIONS.map((section, index) => {
              const hasContent = !!sectionContent[section.id];
              const isSelected = selectedSection === section.id;

              return (
                <button
                  key={section.id}
                  onClick={() => setSelectedSection(section.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left mb-1 transition-colors',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  )}
                >
                  <div className="flex-shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs">
                    {hasContent ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      index + 1
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{section.name}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      {/* Editor area */}
      <div className="flex-1 flex flex-col">
        {/* Section header */}
        <div className="border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">{currentSectionInfo?.name}</h2>
              <p className="text-sm text-muted-foreground">
                {currentSectionInfo?.description}
              </p>
            </div>
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

          {/* Coherence warnings */}
          {checkCoherenceMutation.data?.conflicts &&
            checkCoherenceMutation.data.conflicts.length > 0 && (
              <Alert variant="destructive" className="mt-4">
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
        </div>

        {/* Content area */}
        <div className="flex-1 p-6 overflow-auto">
          <div className="max-w-3xl mx-auto">
            {showPreview ? (
              <Card>
                <CardContent className="pt-6">
                  <div className="prose prose-sm max-w-none">
                    {editedContent || (
                      <p className="text-muted-foreground italic">
                        No content yet. Click "Generate" to create content from your
                        questionnaire answers.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Generate button if no content */}
                {!editedContent && !sectionContent[selectedSection] && (
                  <Alert>
                    <Sparkles className="h-4 w-4" />
                    <AlertDescription className="flex items-center justify-between">
                      <span>
                        Generate content based on your questionnaire answers
                      </span>
                      <Button
                        size="sm"
                        onClick={handleGenerate}
                        disabled={generateMutation.isPending}
                      >
                        {generateMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        Generate
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                <Textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  placeholder={`Write or generate the ${currentSectionInfo?.name} section...`}
                  className="min-h-[400px] font-mono text-sm"
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer with navigation and save */}
        <div className="border-t px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => {
                if (currentIndex > 0) {
                  setSelectedSection(DOCUMENT_SECTIONS[currentIndex - 1].id);
                }
              }}
              disabled={currentIndex === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
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

              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending || !editedContent}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Section
              </Button>
            </div>

            <Button
              variant="outline"
              onClick={() => {
                if (currentIndex < DOCUMENT_SECTIONS.length - 1) {
                  setSelectedSection(DOCUMENT_SECTIONS[currentIndex + 1].id);
                }
              }}
              disabled={currentIndex === DOCUMENT_SECTIONS.length - 1}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DocumentMode;
