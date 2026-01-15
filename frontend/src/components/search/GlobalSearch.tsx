import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, FolderOpen, User, File, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { searchApi, QuickSearchResult, SearchResult } from '@/lib/api';
import { cn } from '@/lib/utils';

interface GlobalSearchProps {
  className?: string;
}

export function GlobalSearch({ className }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<QuickSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Flatten results for keyboard navigation
  const flattenedResults = useCallback((): SearchResult[] => {
    if (!results) return [];
    const flat: SearchResult[] = [];
    if (results.projects) flat.push(...results.projects);
    if (results.forms) flat.push(...results.forms);
    if (results.users) flat.push(...results.users);
    if (results.files) flat.push(...results.files);
    return flat;
  }, [results]);

  // Keyboard shortcut to open search (Cmd+K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery('');
      setResults(null);
      setSelectedIndex(0);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!query || query.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const response = await searchApi.quickSearch(query);
        setResults(response.data.data);
        setSelectedIndex(0);
      } catch (error) {
        console.error('Quick search error:', error);
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = flattenedResults();

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (items.length || 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + (items.length || 1)) % (items.length || 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (items.length > 0 && items[selectedIndex]) {
          handleSelect(items[selectedIndex]);
        } else if (query.length >= 2) {
          // Navigate to full search results
          handleViewAll();
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
    }
  };

  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    navigate(result.link);
  };

  const handleViewAll = () => {
    setOpen(false);
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'project':
        return <FolderOpen className="h-4 w-4" />;
      case 'form':
        return <FileText className="h-4 w-4" />;
      case 'user':
        return <User className="h-4 w-4" />;
      case 'file':
        return <File className="h-4 w-4" />;
      default:
        return <Search className="h-4 w-4" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      project: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      form: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      user: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      file: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    };
    return (
      <Badge variant="secondary" className={cn('text-xs', colors[type])}>
        {type}
      </Badge>
    );
  };

  const renderResults = () => {
    if (!results) return null;

    const items = flattenedResults();
    if (items.length === 0) {
      return (
        <div className="py-8 text-center text-muted-foreground">
          No results found for "{query}"
        </div>
      );
    }

    let currentIndex = 0;

    const renderSection = (title: string, items: SearchResult[] | undefined, type: string) => {
      if (!items || items.length === 0) return null;

      const sectionItems = items.map((item, idx) => {
        const itemIndex = currentIndex++;
        return (
          <button
            key={item.id}
            onClick={() => handleSelect(item)}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
              selectedIndex === itemIndex
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-muted'
            )}
          >
            <span className="text-muted-foreground">{getIcon(type)}</span>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{item.title}</div>
              {item.description && (
                <div className="text-sm text-muted-foreground truncate">
                  {item.description}
                </div>
              )}
            </div>
            {getTypeBadge(type)}
          </button>
        );
      });

      return (
        <div key={type} className="mb-4">
          <div className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">
            {title}
          </div>
          <div className="space-y-1">{sectionItems}</div>
        </div>
      );
    };

    // Reset currentIndex before rendering
    currentIndex = 0;

    return (
      <>
        {renderSection('Projects', results.projects, 'project')}
        {renderSection('Forms', results.forms, 'form')}
        {renderSection('Users', results.users, 'user')}
        {renderSection('Files', results.files, 'file')}
      </>
    );
  };

  const hasResults = results && flattenedResults().length > 0;

  return (
    <>
      {/* Trigger button */}
      <Button
        variant="outline"
        className={cn(
          'relative w-64 justify-start text-muted-foreground',
          className
        )}
        onClick={() => setOpen(true)}
      >
        <Search className="mr-2 h-4 w-4" />
        <span>Search...</span>
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 hidden sm:inline-flex">
          <span className="text-xs">Cmd</span>K
        </kbd>
      </Button>

      {/* Search dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
          {/* Search input */}
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search projects, forms, users, files..."
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-12"
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {/* Results */}
          {query.length >= 2 && (
            <ScrollArea className="max-h-[400px]">
              <div className="p-2">
                {renderResults()}
              </div>
            </ScrollArea>
          )}

          {/* Footer */}
          {query.length >= 2 && (
            <div className="flex items-center justify-between border-t bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-4">
                <span>
                  <kbd className="rounded border bg-background px-1">Enter</kbd> to select
                </span>
                <span>
                  <kbd className="rounded border bg-background px-1">Esc</kbd> to close
                </span>
              </div>
              {hasResults && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto py-1 text-xs"
                  onClick={handleViewAll}
                >
                  View all results
                </Button>
              )}
            </div>
          )}

          {/* Empty state when no query */}
          {query.length < 2 && (
            <div className="p-8 text-center text-muted-foreground">
              <Search className="mx-auto mb-4 h-8 w-8 opacity-50" />
              <p>Start typing to search across projects, forms, users, and files.</p>
              <p className="mt-2 text-sm">Minimum 2 characters required.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default GlobalSearch;
