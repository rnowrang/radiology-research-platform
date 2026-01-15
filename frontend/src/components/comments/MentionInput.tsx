import * as React from 'react';
import { useRef, useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface MentionUser {
  id: string;
  name: string;
  email: string;
  username: string;
}

export interface MentionInputProps {
  /**
   * The textarea value
   */
  value: string;
  /**
   * Callback when value changes
   */
  onChange: (value: string) => void;
  /**
   * List of users that can be mentioned
   */
  users: MentionUser[];
  /**
   * Placeholder text
   */
  placeholder?: string;
  /**
   * Whether the input is disabled
   */
  disabled?: boolean;
  /**
   * Minimum number of rows
   */
  minRows?: number;
  /**
   * Maximum number of rows (for auto-resize)
   */
  maxRows?: number;
  /**
   * Additional class names
   */
  className?: string;
  /**
   * Callback when a user is mentioned
   */
  onMention?: (user: MentionUser) => void;
  /**
   * Ref to the textarea element
   */
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
}

/**
 * Textarea with @mention autocomplete support
 */
export function MentionInput({
  value,
  onChange,
  users,
  placeholder = 'Write a comment... Use @ to mention someone',
  disabled = false,
  minRows = 3,
  maxRows = 10,
  className,
  onMention,
  textareaRef: externalRef,
}: MentionInputProps) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef || internalRef;

  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });

  // Filter users based on query
  const filteredUsers = React.useMemo(() => {
    if (!mentionQuery) return users;

    const query = mentionQuery.toLowerCase();
    return users.filter(
      (user) =>
        user.username.toLowerCase().includes(query) ||
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query)
    );
  }, [users, mentionQuery]);

  // Reset selected index when filtered users change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredUsers.length]);

  // Calculate popover position near cursor
  const updatePopoverPosition = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Get cursor position relative to textarea
    const rect = textarea.getBoundingClientRect();
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;

    // Simple approximation of cursor position
    const textBeforeCursor = value.substring(0, textarea.selectionStart);
    const lines = textBeforeCursor.split('\n');
    const currentLine = lines.length - 1;
    const charsInCurrentLine = lines[lines.length - 1].length;
    const charWidth = 8; // Approximate character width

    setPopoverPosition({
      top: rect.top + (currentLine + 1) * lineHeight + window.scrollY,
      left: rect.left + Math.min(charsInCurrentLine * charWidth, rect.width - 200) + window.scrollX,
    });
  }, [value, textareaRef]);

  // Handle text changes
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursorPos = e.target.selectionStart;
      onChange(newValue);

      // Check if we should show mention dropdown
      const textBeforeCursor = newValue.substring(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf('@');

      if (lastAtIndex !== -1) {
        // Check if @ is at start or after whitespace
        const charBefore = textBeforeCursor[lastAtIndex - 1];
        const isValidPosition = lastAtIndex === 0 || /\s/.test(charBefore);

        // Get text after @ (the query)
        const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
        const hasSpaceAfter = /\s/.test(textAfterAt);

        if (isValidPosition && !hasSpaceAfter) {
          setMentionQuery(textAfterAt);
          setMentionStartIndex(lastAtIndex);
          setShowMentions(true);
          updatePopoverPosition();
        } else {
          setShowMentions(false);
        }
      } else {
        setShowMentions(false);
      }
    },
    [onChange, updatePopoverPosition]
  );

  // Insert mention
  const insertMention = useCallback(
    (user: MentionUser) => {
      const textarea = textareaRef.current;
      if (!textarea || mentionStartIndex === -1) return;

      const beforeMention = value.substring(0, mentionStartIndex);
      const afterMention = value.substring(textarea.selectionStart);
      const newValue = `${beforeMention}@${user.username} ${afterMention}`;

      onChange(newValue);
      setShowMentions(false);
      setMentionQuery('');
      setMentionStartIndex(-1);
      onMention?.(user);

      // Focus and set cursor position after mention
      setTimeout(() => {
        const newCursorPos = mentionStartIndex + user.username.length + 2; // +2 for @ and space
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    },
    [value, onChange, mentionStartIndex, onMention, textareaRef]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showMentions || filteredUsers.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredUsers.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredUsers.length - 1
          );
          break;
        case 'Enter':
        case 'Tab':
          if (filteredUsers[selectedIndex]) {
            e.preventDefault();
            insertMention(filteredUsers[selectedIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setShowMentions(false);
          break;
      }
    },
    [showMentions, filteredUsers, selectedIndex, insertMention]
  );

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
    const minHeight = minRows * lineHeight;
    const maxHeight = maxRows * lineHeight;
    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;
  }, [value, minRows, maxRows, textareaRef]);

  // Get initials for avatar
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <div className={cn('relative', className)}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none',
          className
        )}
        style={{
          minHeight: `${minRows * 20}px`,
        }}
      />

      {/* Mention dropdown */}
      {showMentions && filteredUsers.length > 0 && (
        <div
          className="fixed z-50 min-w-[200px] max-w-[300px] rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95"
          style={{
            top: popoverPosition.top,
            left: popoverPosition.left,
          }}
        >
          <ScrollArea className="max-h-[200px]">
            <div className="p-1">
              {filteredUsers.map((user, index) => (
                <button
                  key={user.id}
                  className={cn(
                    'relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
                    index === selectedIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent hover:text-accent-foreground'
                  )}
                  onClick={() => insertMention(user)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  type="button"
                >
                  <Avatar className="h-6 w-6 mr-2">
                    <AvatarFallback className="text-xs">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="font-medium truncate">{user.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      @{user.username}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* No results message */}
      {showMentions && filteredUsers.length === 0 && mentionQuery && (
        <div
          className="fixed z-50 min-w-[200px] rounded-md border bg-popover p-3 text-sm text-muted-foreground shadow-md"
          style={{
            top: popoverPosition.top,
            left: popoverPosition.left,
          }}
        >
          No users found matching "@{mentionQuery}"
        </div>
      )}
    </div>
  );
}

/**
 * Renders text with highlighted mentions
 */
export function MentionText({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  // Split content by @mentions
  const parts = React.useMemo(() => {
    const mentionRegex = /@([a-zA-Z0-9_.\-]+)/g;
    const result: Array<{ type: 'text' | 'mention'; content: string }> = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      // Add text before mention
      if (match.index > lastIndex) {
        result.push({
          type: 'text',
          content: content.substring(lastIndex, match.index),
        });
      }

      // Add mention
      result.push({
        type: 'mention',
        content: match[0], // Full match including @
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      result.push({
        type: 'text',
        content: content.substring(lastIndex),
      });
    }

    return result;
  }, [content]);

  return (
    <span className={className}>
      {parts.map((part, index) =>
        part.type === 'mention' ? (
          <span
            key={index}
            className="inline-block rounded bg-primary/10 px-1 font-medium text-primary"
          >
            {part.content}
          </span>
        ) : (
          <span key={index}>{part.content}</span>
        )
      )}
    </span>
  );
}

export default MentionInput;
