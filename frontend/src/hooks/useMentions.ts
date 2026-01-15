import { useState, useEffect, useCallback, useMemo } from 'react';
import { reviewApi } from '@/lib/api';

export interface MentionableUser {
  id: string;
  name: string;
  email: string;
  username: string;
}

interface UseMentionableUsersReturn {
  /**
   * List of users that can be mentioned
   */
  users: MentionableUser[];
  /**
   * Whether users are being loaded
   */
  isLoading: boolean;
  /**
   * Error from loading users
   */
  error: Error | null;
  /**
   * Refetch the users list
   */
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch users that can be mentioned in comments for a form
 */
export function useMentionableUsers(formId: number): UseMentionableUsersReturn {
  const [users, setUsers] = useState<MentionableUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchUsers = useCallback(async () => {
    if (!formId) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await reviewApi.getMentionableUsers(formId);
      setUsers(response.data.users || []);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch mentionable users');
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return {
    users,
    isLoading,
    error,
    refetch: fetchUsers,
  };
}

/**
 * Regex pattern for @mentions
 */
const MENTION_PATTERN = /@([a-zA-Z0-9_.\-]+)/g;

interface ParsedMention {
  username: string;
  startIndex: number;
  endIndex: number;
}

interface UseMentionParserReturn {
  /**
   * List of mentions found in the content
   */
  mentions: ParsedMention[];
  /**
   * Whether the content has any mentions
   */
  hasMentions: boolean;
  /**
   * Extract unique usernames from content
   */
  extractUsernames: () => string[];
  /**
   * Resolve mentions to user objects
   */
  resolveMentions: (users: MentionableUser[]) => MentionableUser[];
  /**
   * Highlight mentions in content (returns HTML-safe string with spans)
   */
  highlightMentions: () => Array<{ type: 'text' | 'mention'; content: string }>;
}

/**
 * Hook to parse and highlight @mentions in text content
 */
export function useMentionParser(content: string): UseMentionParserReturn {
  const mentions = useMemo<ParsedMention[]>(() => {
    if (!content) return [];

    const result: ParsedMention[] = [];
    let match;

    // Create a fresh regex each time to reset lastIndex
    const regex = new RegExp(MENTION_PATTERN.source, 'g');

    while ((match = regex.exec(content)) !== null) {
      result.push({
        username: match[1], // Captured group (without @)
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }

    return result;
  }, [content]);

  const hasMentions = mentions.length > 0;

  const extractUsernames = useCallback((): string[] => {
    // Return unique usernames
    const usernames = mentions.map((m) => m.username);
    return [...new Set(usernames)];
  }, [mentions]);

  const resolveMentions = useCallback(
    (users: MentionableUser[]): MentionableUser[] => {
      const usernames = extractUsernames();
      return users.filter((user) =>
        usernames.some((username) => username.toLowerCase() === user.username.toLowerCase())
      );
    },
    [extractUsernames]
  );

  const highlightMentions = useCallback((): Array<{ type: 'text' | 'mention'; content: string }> => {
    if (!content || !hasMentions) {
      return content ? [{ type: 'text', content }] : [];
    }

    const result: Array<{ type: 'text' | 'mention'; content: string }> = [];
    let lastIndex = 0;

    for (const mention of mentions) {
      // Add text before mention
      if (mention.startIndex > lastIndex) {
        result.push({
          type: 'text',
          content: content.substring(lastIndex, mention.startIndex),
        });
      }

      // Add mention
      result.push({
        type: 'mention',
        content: content.substring(mention.startIndex, mention.endIndex),
      });

      lastIndex = mention.endIndex;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      result.push({
        type: 'text',
        content: content.substring(lastIndex),
      });
    }

    return result;
  }, [content, mentions, hasMentions]);

  return {
    mentions,
    hasMentions,
    extractUsernames,
    resolveMentions,
    highlightMentions,
  };
}

/**
 * Parse mentions from content string
 */
export function parseMentions(content: string): string[] {
  if (!content) return [];

  const matches = content.match(MENTION_PATTERN) || [];
  // Remove @ prefix and return unique usernames
  const usernames = matches.map((m) => m.substring(1));
  return [...new Set(usernames)];
}

/**
 * Check if content contains any mentions
 */
export function hasMentions(content: string): boolean {
  return MENTION_PATTERN.test(content);
}

export default useMentionableUsers;
