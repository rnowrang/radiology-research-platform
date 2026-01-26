import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  protocolAssistantApi,
  ChatMessage as ChatMessageType,
  GapQuestion,
} from '@/lib/protocolAssistantApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Sparkles } from 'lucide-react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { GenerationActions } from './GenerationActions';
import { GapQuestions } from './GapQuestions';
import { toast } from '@/hooks/useToast';

interface ChatPanelProps {
  projectId: string;
}

export function ChatPanel({ projectId }: ChatPanelProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [generatingType, setGeneratingType] = useState<string>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Get or create session
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['protocolSession', projectId],
    queryFn: () => protocolAssistantApi.getOrCreateSession(projectId),
  });

  useEffect(() => {
    if (session) {
      setSessionId(session.session_id);
    }
  }, [session]);

  // Get chat history
  const { data: historyData } = useQuery({
    queryKey: ['chatHistory', sessionId],
    queryFn: () => protocolAssistantApi.getHistory(sessionId!),
    enabled: !!sessionId,
  });

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: (msg: string) => protocolAssistantApi.sendMessage(sessionId!, msg),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatHistory', sessionId] });
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
    mutationFn: (file: File) => protocolAssistantApi.uploadDocument(sessionId!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatHistory', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['protocolSession', projectId] });
      toast({
        title: 'Success',
        description: 'Protocol analyzed successfully',
      });
    },
    onError: () => {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to analyze document',
      });
    },
  });

  // Generation mutations
  const generateMutation = useMutation({
    mutationFn: async (type: string) => {
      setGeneratingType(type);
      switch (type) {
        case 'abstract':
          return protocolAssistantApi.generateAbstract(sessionId!);
        case 'consent':
          return protocolAssistantApi.generateConsent(sessionId!);
        case 'protocol':
          return protocolAssistantApi.generateProtocol(sessionId!);
        case 'all':
          return protocolAssistantApi.generateAll(sessionId!);
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

  const handleSend = (msg: string) => {
    if (sessionId) {
      sendMutation.mutate(msg);
    }
  };

  const handleUpload = (file: File) => {
    if (sessionId) {
      uploadMutation.mutate(file);
    }
  };

  const handleQuestionClick = (question: GapQuestion) => {
    // Send the question directly
    handleSend(question.question);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [historyData?.messages]);

  if (sessionLoading) {
    return (
      <Card className="h-[600px] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </Card>
    );
  }

  const hasProtocol = session?.has_extracted_protocol;
  const gaps = session?.current_gaps || [];

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="pb-3 border-b">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Protocol Assistant
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Chat Messages */}
        <ScrollArea className="flex-1 px-4">
          <div className="space-y-4 py-4" ref={scrollRef}>
            {/* Welcome message if no history */}
            {!historyData?.messages?.length && (
              <div className="py-8 text-center">
                <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-xl font-medium">Ready when you are.</h3>
                <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                  Upload a research protocol using the + button below, or ask me questions about
                  preparing your IRB submission.
                </p>
              </div>
            )}

            {/* Gap Questions */}
            {hasProtocol && gaps.length > 0 && (
              <GapQuestions gaps={gaps} onQuestionClick={handleQuestionClick} />
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

        {/* Action Buttons (when protocol is analyzed) */}
        {hasProtocol && (
          <GenerationActions
            onGenerateAbstract={() => generateMutation.mutate('abstract')}
            onGenerateConsent={() => generateMutation.mutate('consent')}
            onGenerateProtocol={() => generateMutation.mutate('protocol')}
            onGenerateAll={() => generateMutation.mutate('all')}
            isGenerating={generateMutation.isPending}
            generatingType={generatingType}
            disabled={!sessionId}
          />
        )}

        {/* Input Area - ChatGPT style */}
        <ChatInput
          onSend={handleSend}
          onUpload={handleUpload}
          isSending={sendMutation.isPending}
          isUploading={uploadMutation.isPending}
          placeholder={hasProtocol ? 'Ask about your protocol...' : 'Ask anything'}
          disabled={!sessionId}
        />
      </CardContent>
    </Card>
  );
}
