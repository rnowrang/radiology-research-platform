import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  protocolAssistantApi,
  ChatMessage as ChatMessageType,
  GapQuestion,
} from '@/lib/protocolAssistantApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Sparkles, FileText, Copy, ExternalLink } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ModeSelectionModal } from './ModeSelectionModal';
import { ModeToggle } from './ModeToggle';
import { GuidedWizardPanel } from './GuidedWizardPanel';
import { useWizardStore, GeneratedDocument } from '@/stores/wizardStore';
import { toast } from '@/hooks/useToast';

interface ChatPanelProps {
  projectId: string;
}

export function ChatPanel({ projectId }: ChatPanelProps) {
  const [localSessionId, setLocalSessionId] = useState<string | null>(null);
  const [generatingType, setGeneratingType] = useState<string>();
  const [mode, setMode] = useState<'guided' | 'chat'>('chat');
  const [showModeModal, setShowModeModal] = useState(false);
  const [hasSeenModeModal, setHasSeenModeModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState<GeneratedDocument | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Use wizard store for persisting generated documents (scoped to session)
  const {
    generatedDocuments,
    addGeneratedDocument,
    addGeneratedDocuments,
    setSessionId: setStoreSessionId,
  } = useWizardStore();

  // Get or create session
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['protocolSession', projectId],
    queryFn: () => protocolAssistantApi.getOrCreateSession(projectId),
  });

  useEffect(() => {
    if (session) {
      setLocalSessionId(session.session_id);
      // Update store session - this clears documents if session changed
      setStoreSessionId(session.session_id);
    }
  }, [session, setStoreSessionId]);

  // Get chat history
  const { data: historyData } = useQuery({
    queryKey: ['chatHistory', localSessionId],
    queryFn: () => protocolAssistantApi.getHistory(localSessionId!),
    enabled: !!localSessionId,
  });

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: (msg: string) => protocolAssistantApi.sendMessage(localSessionId!, msg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatHistory', localSessionId] });
    },
    onError: () => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to send message',
      });
    },
  });

  // Upload document mutation
  const uploadMutation = useMutation({
    mutationFn: (file: File) => protocolAssistantApi.uploadDocument(localSessionId!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatHistory', localSessionId] });
      queryClient.invalidateQueries({ queryKey: ['protocolSession', projectId] });
      toast({
        title: 'Success',
        description: 'Protocol analyzed successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to analyze document',
      });
    },
  });

  // Generation mutations
  const generateMutation = useMutation({
    mutationFn: async (type: string) => {
      switch (type) {
        case 'abstract':
          return protocolAssistantApi.generateAbstract(localSessionId!);
        case 'consent':
          return protocolAssistantApi.generateConsent(localSessionId!);
        case 'protocol':
          return protocolAssistantApi.generateProtocol(localSessionId!);
        case 'all':
          return protocolAssistantApi.generateAll(localSessionId!);
        default:
          throw new Error('Unknown generation type');
      }
    },
    onMutate: (type) => {
      setGeneratingType(type);
    },
    onSuccess: (result) => {
      setGeneratingType(undefined);
      queryClient.invalidateQueries({ queryKey: ['chatHistory', localSessionId] });

      // Handle single document vs bulk generation
      if (Array.isArray(result)) {
        // Bulk generation
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
        // Show the first document in modal
        if (successfulDocs.length > 0) {
          setGeneratedDoc(successfulDocs[0]);
          setShowDocumentModal(true);
        }
      } else if (result && typeof result === 'object' && 'doc_type' in result) {
        // Single document
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
          description: 'Received unexpected response format',
        });
      }
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

  const handleSend = (msg: string) => {
    if (localSessionId) {
      sendMutation.mutate(msg);
    }
  };

  const handleUpload = (file: File) => {
    if (localSessionId) {
      uploadMutation.mutate(file);
    }
  };

  const handleQuestionClick = (question: GapQuestion) => {
    // Send the question directly
    handleSend(question.question);
  };

  const hasProtocol = session?.has_extracted_protocol;
  const gaps = session?.current_gaps || [];

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [historyData?.messages]);

  // Show mode selection modal after successful upload with gaps
  useEffect(() => {
    if (hasProtocol && gaps.length > 0 && !hasSeenModeModal) {
      setShowModeModal(true);
    }
  }, [hasProtocol, gaps.length, hasSeenModeModal]);

  const handleModeSelect = (selectedMode: 'guided' | 'chat') => {
    setMode(selectedMode);
    setShowModeModal(false);
    setHasSeenModeModal(true);
  };

  if (sessionLoading) {
    return (
      <Card className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </Card>
    );
  }

  return (
    <>
      <Card className="h-full flex flex-col overflow-hidden">
        <CardHeader className="py-2 px-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Protocol Assistant
            </CardTitle>
            {hasProtocol && (
              <ModeToggle
                mode={mode}
                onChange={setMode}
                disabled={sessionLoading}
              />
            )}
          </div>
        </CardHeader>

        <CardContent className="flex-1 p-0 overflow-hidden">
          {mode === 'guided' && localSessionId ? (
            <GuidedWizardPanel
              sessionId={localSessionId}
              projectId={projectId}
              onSwitchToChat={() => setMode('chat')}
            />
          ) : (
            <div className="flex h-full gap-3 p-3 overflow-hidden">
              {/* Left Panel - Chat Conversation */}
              <div className="flex-1 flex flex-col min-w-0 border rounded-lg bg-background overflow-hidden">
                {/* Chat Messages */}
                <ScrollArea className="flex-1 px-3">
                  <div className="space-y-3 py-3" ref={scrollRef}>
                    {/* Welcome message if no history */}
                    {!historyData?.messages?.length && (
                      <div className="py-6 text-center">
                        <Sparkles className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                        <h3 className="text-lg font-medium">Ready when you are.</h3>
                        <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                          Upload a protocol using the + button, or ask questions about IRB submissions.
                        </p>
                      </div>
                    )}

                    {/* Messages */}
                    {historyData?.messages?.map((msg: ChatMessageType) => (
                      <ChatMessage key={msg.id} message={msg} />
                    ))}

                    {/* Loading indicator */}
                    {sendMutation.isPending && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm">Thinking...</span>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                {/* Input Area */}
                <div className="shrink-0 border-t">
                  <ChatInput
                    onSend={handleSend}
                    onUpload={handleUpload}
                    isSending={sendMutation.isPending}
                    isUploading={uploadMutation.isPending}
                    placeholder={hasProtocol ? 'Ask about your protocol...' : 'Ask anything'}
                    disabled={!localSessionId}
                  />
                </div>
              </div>

              {/* Right Panel - Actions & Info */}
              <div className="w-72 shrink-0 flex flex-col gap-3 overflow-hidden">
                {/* Gap Questions Card */}
                {hasProtocol && gaps.length > 0 && (
                  <div className="border rounded-lg bg-background p-3 max-h-48 overflow-hidden flex flex-col">
                    <h4 className="text-sm font-medium flex items-center gap-2 mb-2 shrink-0">
                      <FileText className="h-4 w-4 text-primary" />
                      Gap Questions
                      <span className="text-xs text-muted-foreground">({gaps.length})</span>
                    </h4>
                    <ScrollArea className="flex-1 -mx-1 px-1">
                      <div className="space-y-1.5">
                        {gaps.slice(0, 5).map((gap) => (
                          <button
                            key={gap.id}
                            className="w-full text-left p-2 rounded-md border hover:bg-muted/50 transition-colors"
                            onClick={() => handleQuestionClick(gap)}
                          >
                            <p className="text-xs line-clamp-2">{gap.question}</p>
                          </button>
                        ))}
                        {gaps.length > 5 && (
                          <p className="text-xs text-muted-foreground text-center py-1">
                            +{gaps.length - 5} more
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {/* Actions Card */}
                {hasProtocol && (
                  <div className="border rounded-lg bg-background p-3 space-y-3">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Generate Documents
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => generateMutation.mutate('abstract')}
                        disabled={generateMutation.isPending || !localSessionId}
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
                        disabled={generateMutation.isPending || !localSessionId}
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
                        disabled={generateMutation.isPending || !localSessionId}
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
                        disabled={generateMutation.isPending || !localSessionId}
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
                )}

                {/* Generated Documents Card */}
                <div className="border rounded-lg bg-background p-3 flex-1 min-h-0 flex flex-col overflow-hidden">
                  <h4 className="text-sm font-medium flex items-center gap-2 mb-2 shrink-0">
                    <FileText className="h-4 w-4 text-primary" />
                    Generated Documents
                    {generatedDocuments.length > 0 && (
                      <span className="text-xs text-muted-foreground">({generatedDocuments.length})</span>
                    )}
                  </h4>

                  {generatedDocuments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {hasProtocol
                        ? 'Use the buttons above to generate documents.'
                        : 'Upload a protocol to get started.'}
                    </p>
                  ) : (
                    <ScrollArea className="flex-1 -mx-1 px-1">
                      <div className="space-y-1.5">
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
                                className="h-6 w-6 p-0"
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
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
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
            </div>
          )}
        </CardContent>
      </Card>

      <ModeSelectionModal
        open={showModeModal}
        onSelect={handleModeSelect}
        gapCount={gaps.length}
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
            <Button
              variant="outline"
              onClick={() => {
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
              }}
            >
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
    </>
  );
}
