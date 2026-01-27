/**
 * Chat Mode - Free-form conversation with the AI assistant
 *
 * Provides:
 * - Chat history display
 * - Message input with streaming support
 * - Document upload
 * - Suggestion chips
 */

import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIntelligenceStore } from '@/stores/intelligenceStore';
import * as intelligenceApi from '@/lib/intelligenceApi';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Send,
  Paperclip,
  Loader2,
  Bot,
  User,
  Sparkles,
  Upload,
} from 'lucide-react';

interface ChatModeProps {
  projectId: string;
  sessionId: string;
  onSwitchToGuided?: () => void;
}

export function ChatMode({ projectId, sessionId, onSwitchToGuided }: ChatModeProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');

  const { chatMessages, addChatMessage, setChatInputDraft } = useIntelligenceStore();

  // Fetch chat history
  const historyQuery = useQuery({
    queryKey: ['chat-history', sessionId],
    queryFn: () => intelligenceApi.getChatHistory(sessionId),
    enabled: !!sessionId,
  });

  // Initialize messages from history
  useEffect(() => {
    if (historyQuery.data?.messages) {
      // Only add messages not already in store
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
      // Add user message immediately
      addChatMessage({ role: 'user', content });

      // Stream response
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

  // Upload document mutation
  const uploadMutation = useMutation({
    mutationFn: (file: File) => intelligenceApi.uploadDocument(sessionId, file),
    onSuccess: (data) => {
      addChatMessage({
        role: 'system',
        content: `Document "${data.filename}" uploaded successfully. Extracted ${data.factsExtracted} facts.`,
      });

      if (data.gapCount > 0 && onSwitchToGuided) {
        addChatMessage({
          role: 'assistant',
          content: `I found ${data.gapCount} areas that need more information. Would you like to switch to Guided Mode to fill in the gaps?`,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['questionnaire', projectId] });
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

  // Quick suggestions
  const suggestions = [
    'What information do you need from me?',
    'Help me write my study objectives',
    'What documents do I need for my IRB submission?',
    'Review my protocol for completeness',
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <div className="space-y-4 max-w-3xl mx-auto">
          {/* Welcome message if no history */}
          {chatMessages.length === 0 && !historyQuery.isLoading && (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                Welcome to the Research Intelligence Assistant
              </h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                I can help you prepare your IRB submission, answer questions about
                your protocol, and generate documents.
              </p>

              {/* Quick start suggestions */}
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((suggestion) => (
                  <Button
                    key={suggestion}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setInputValue(suggestion);
                      inputRef.current?.focus();
                    }}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
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
                <AvatarFallback>
                  {message.role === 'user' ? (
                    <User className="h-4 w-4" />
                  ) : message.role === 'system' ? (
                    <Sparkles className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </AvatarFallback>
              </Avatar>

              <div
                className={cn(
                  'rounded-lg px-4 py-2 max-w-[80%]',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : message.role === 'system'
                    ? 'bg-muted text-muted-foreground text-sm'
                    : 'bg-muted'
                )}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
              </div>
            </div>
          ))}

          {/* Streaming message */}
          {isStreaming && streamingContent && (
            <div className="flex gap-3">
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarFallback>
                  <Bot className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="rounded-lg px-4 py-2 bg-muted max-w-[80%]">
                <div className="whitespace-pre-wrap">{streamingContent}</div>
                <span className="inline-block w-2 h-4 bg-foreground/50 animate-pulse ml-1" />
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {(sendMutation.isPending || uploadMutation.isPending) &&
            !isStreaming && (
              <div className="flex gap-3">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback>
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="rounded-lg px-4 py-2 bg-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="border-t p-4">
        <div className="max-w-3xl mx-auto">
          {/* File upload progress */}
          {uploadMutation.isPending && (
            <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Uploading document...</span>
            </div>
          )}

          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.txt,.rtf"
              onChange={handleFileSelect}
            />

            <Button
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadMutation.isPending}
              title="Upload document"
            >
              {uploadMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </Button>

            <Textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about your research protocol..."
              className="min-h-[44px] max-h-[200px] resize-none"
              disabled={isStreaming}
            />

            <Button
              onClick={handleSend}
              disabled={!inputValue.trim() || isStreaming}
              title="Send message (Cmd+Enter)"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mt-2 text-center">
            Press Cmd+Enter to send
          </p>
        </div>
      </div>
    </div>
  );
}

export default ChatMode;
