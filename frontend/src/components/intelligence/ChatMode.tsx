/**
 * Chat Mode - Free-form conversation with the AI assistant
 *
 * Matching questionnaire wizard appearance with:
 * - Sidebar with project info and suggestions
 * - Card-based chat interface
 * - Consistent navigation
 */

import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIntelligenceStore } from '@/stores/intelligenceStore';
import * as intelligenceApi from '@/lib/intelligenceApi';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import {
  Send,
  Plus,
  Loader2,
  Bot,
  User,
  Sparkles,
  FileText,
  MessageSquare,
  Lightbulb,
} from 'lucide-react';

interface ChatModeProps {
  projectId: string;
  sessionId: string;
  onSwitchToGuided?: () => void;
}

// Quick suggestion categories with emojis
const suggestionCategories = [
  { id: 'getting_started', emoji: '🚀', label: 'Getting Started' },
  { id: 'protocol', emoji: '📋', label: 'Protocol Help' },
  { id: 'irb', emoji: '📝', label: 'IRB Requirements' },
  { id: 'documents', emoji: '📄', label: 'Documents' },
];

export function ChatMode({ projectId, sessionId, onSwitchToGuided }: ChatModeProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { chatMessages, addChatMessage, setChatInputDraft, getProgress } = useIntelligenceStore();

  const progress = getProgress();

  // Fetch chat history
  const historyQuery = useQuery({
    queryKey: ['chat-history', sessionId],
    queryFn: () => intelligenceApi.getChatHistory(sessionId),
    enabled: !!sessionId,
  });

  // Initialize messages from history
  useEffect(() => {
    if (historyQuery.data?.messages) {
      const existingIds = new Set(chatMessages.map((m) => m.id));
      historyQuery.data.messages.forEach((msg) => {
        if (!existingIds.has(msg.id)) {
          addChatMessage({
            role: msg.role,
            content: msg.content,
            metadata: msg.metadata,
          });
        }
      });
    }
  }, [historyQuery.data]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, streamingContent]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      addChatMessage({ role: 'user', content });
      setIsStreaming(true);
      setStreamingContent('');

      return new Promise<void>((resolve, reject) => {
        intelligenceApi.streamChatMessage(
          sessionId,
          content,
          (chunk) => {
            setStreamingContent((prev) => prev + chunk);
          },
          (response) => {
            setIsStreaming(false);
            addChatMessage({
              role: 'assistant',
              content: response.message.content,
            });
            setStreamingContent('');
            resolve();
          },
          (error) => {
            setIsStreaming(false);
            setStreamingContent('');
            reject(error);
          }
        );
      });
    },
    onError: (error) => {
      console.error('Send message error:', error);
      addChatMessage({
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      });
    },
  });

  // Upload document mutation - uses knowledge base endpoint to store extracted facts
  const uploadMutation = useMutation({
    mutationFn: (file: File) => intelligenceApi.uploadKnowledgeDocument(projectId, file, 'protocol', true),
    onSuccess: (data) => {
      const factsCount = data.factsExtracted || 0;
      addChatMessage({
        role: 'system',
        content: `Document "${data.filename}" uploaded successfully. Extracted ${factsCount} facts.`,
      });

      if (factsCount > 0) {
        addChatMessage({
          role: 'assistant',
          content: `I've extracted ${factsCount} facts from your document. Switch to Guided Mode to review and fill in any gaps!`,
        });
      } else {
        addChatMessage({
          role: 'assistant',
          content: `I couldn't extract structured facts from this document. It may not contain recognizable protocol information, or it might be in an unsupported format. Supported formats: PDF, DOCX, DOC, RTF. You can still answer questions manually in Guided Mode.`,
        });
      }

      // Refresh questionnaire data to pick up extracted facts
      queryClient.invalidateQueries({ queryKey: ['questionnaire', projectId] });
      queryClient.invalidateQueries({ queryKey: ['knowledge-stats', projectId] });
    },
  });

  const handleSend = () => {
    const content = inputValue.trim();
    if (!content || isStreaming) return;

    setInputValue('');
    setChatInputDraft('');
    sendMutation.mutate(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
    }
    e.target.value = '';
  };

  // Quick suggestions by category
  const suggestions: Record<string, string[]> = {
    getting_started: [
      'What information do you need from me?',
      'How do I get started with my IRB submission?',
    ],
    protocol: [
      'Help me write my study objectives',
      'Review my protocol for completeness',
    ],
    irb: [
      'What documents do I need for my IRB submission?',
      'What are common IRB review issues?',
    ],
    documents: [
      'Generate a consent form draft',
      'Help me write the risk/benefit section',
    ],
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 border-r bg-muted/30 flex flex-col h-full shrink-0">
        {/* Project Progress */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Project Progress</span>
            <span className="text-sm text-muted-foreground">
              {progress.completionPercentage}%
            </span>
          </div>
          <Progress value={progress.completionPercentage} className="h-2" />
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{progress.answered} answered</span>
            <span>{progress.total - progress.answered} remaining</span>
          </div>
        </div>

        {/* Chat Stats */}
        <div className="px-4 py-2 border-b flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          <span>{chatMessages.length} messages</span>
        </div>

        {/* Quick Suggestions */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            <h3 className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Quick Prompts
            </h3>
            {suggestionCategories.map((category) => (
              <div key={category.id} className="mb-1">
                <Button
                  variant="ghost"
                  className={cn(
                    'w-full justify-start h-auto py-3 px-3',
                    selectedCategory === category.id && 'bg-primary/10 border border-primary/20'
                  )}
                  onClick={() => setSelectedCategory(
                    selectedCategory === category.id ? null : category.id
                  )}
                >
                  <div className="flex items-center gap-3 w-full">
                    <span className="text-base">{category.emoji}</span>
                    <span className="text-sm font-medium">{category.label}</span>
                  </div>
                </Button>
                {selectedCategory === category.id && (
                  <div className="ml-6 mt-1 space-y-1">
                    {suggestions[category.id]?.map((suggestion, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setInputValue(suggestion);
                          inputRef.current?.focus();
                        }}
                        className="block w-full text-left px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="p-4 border-t bg-background">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onSwitchToGuided}
          >
            <Lightbulb className="h-4 w-4 mr-2" />
            Switch to Guided Mode
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.rtf"
          onChange={handleFileSelect}
        />

        {/* Messages */}
        <ScrollArea ref={scrollRef} className="flex-1 p-4">
          <div className="space-y-4 max-w-3xl mx-auto">
            {/* Welcome message if no history */}
            {chatMessages.length === 0 && !historyQuery.isLoading && (
              <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-100 mb-3">
                      <Sparkles className="h-6 w-6 text-purple-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-purple-900 mb-2">
                      Welcome to the Research Assistant
                    </h3>
                    <p className="text-sm text-purple-700 mb-4">
                      I can help you prepare your IRB submission, answer questions,
                      and generate documents. Try a quick prompt from the sidebar!
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Chat messages */}
            {chatMessages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex gap-3',
                  message.role === 'user' && 'flex-row-reverse'
                )}
              >
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className={message.role === 'assistant' ? 'bg-primary/10' : ''}>
                    {message.role === 'user' ? (
                      <User className="h-4 w-4" />
                    ) : message.role === 'system' ? (
                      <FileText className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4 text-primary" />
                    )}
                  </AvatarFallback>
                </Avatar>

                <Card
                  className={cn(
                    'max-w-[80%]',
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : message.role === 'system'
                      ? 'bg-muted'
                      : ''
                  )}
                >
                  <CardContent className="p-3">
                    <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                  </CardContent>
                </Card>
              </div>
            ))}

            {/* Streaming message */}
            {isStreaming && streamingContent && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </AvatarFallback>
                </Avatar>
                <Card className="max-w-[80%]">
                  <CardContent className="p-3">
                    <div className="whitespace-pre-wrap text-sm">{streamingContent}</div>
                    <span className="inline-block w-2 h-4 bg-foreground/50 animate-pulse ml-1" />
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Loading indicator */}
            {(sendMutation.isPending || uploadMutation.isPending) && !isStreaming && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </AvatarFallback>
                </Avatar>
                <Card>
                  <CardContent className="p-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ChatGPT-style Input area */}
        <div className="p-4 bg-background shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center h-12 border border-border rounded-full bg-background px-1">
              {/* Upload button */}
              <button
                type="button"
                className="flex items-center justify-center h-9 w-9 rounded-full hover:bg-muted transition-colors disabled:opacity-50"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
                title="Upload document"
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <Plus className="h-5 w-5 text-muted-foreground" />
                )}
              </button>

              {/* Text input */}
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask anything"
                className="flex-1 h-full bg-transparent border-0 outline-none text-sm px-2 placeholder:text-muted-foreground"
                disabled={isStreaming}
              />

              {/* Send button */}
              <button
                type="button"
                className={cn(
                  "flex items-center justify-center h-9 w-9 rounded-full transition-colors",
                  inputValue.trim() && !isStreaming
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "bg-muted text-muted-foreground"
                )}
                onClick={handleSend}
                disabled={!inputValue.trim() || isStreaming}
                title="Send message"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ChatMode;
